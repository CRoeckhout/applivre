-- 0073 — Fil d'actualité éditorial (ClickUp 869d3c4n0).
--
-- DISTINCT du feed social organique (social_feed_entries / get_feed) : ici un
-- fil ÉDITORIAL, identique pour tous, piloté par les admins. Une table
-- polymorphe `editorial_posts` couvre tous les types de contenu :
--   - announcement / partner : contenu admin en blocs (body JSONB, même schéma
--     que release_notes : title/text/quote/list/table/image). Pas de cible →
--     le clic ouvre l'écran détail `/news/[id]` côté app.
--   - featured_review / book_of_month / featured_sheet : mise en avant d'un
--     contenu existant via (ref_kind, ref_id). Le clic route selon la nature :
--     feed_entry → /feed/[id], book → /book/[isbn], sheet → /sheet/view/[id].
--     Un avis mis en avant mémorise en plus QUEL avis via `review_id` (template
--     custom note + avis, et deep-link fiche livre avec scroll + surbrillance).
--
-- Visibilité côté users : `status='published'` ET `publish_at <= now()` (date
-- future ⇒ programmé, comme release_notes) ET pas expiré. `draft`/`archived`
-- restent cachés. Lecture admin = tout (via is_caller_admin, cf. 0059).
--
-- Plan du fichier :
--   1. Table `editorial_posts` + index + trigger updated_at
--   2. RLS : SELECT (users → live only, admins → tout) + write admin + grants
--   3. RPC publique `get_editorial_feed(p_limit)`
--   4. Bucket Storage `editorial-assets` (public read, admin write)
--   5. RPC admin `admin_editorial_candidates` (candidats à la mise en avant)
--   6. RPC `get_review` (lecture enrichie d'un avis, carte « Avis à la une »)

-- ═══════════════ 1. Table ═══════════════

create table if not exists public.editorial_posts (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in (
                'announcement', 'partner',
                'featured_review', 'book_of_month', 'featured_sheet')),
  title       text not null,
  -- Teaser court optionnel, affiché sur la bannière / carte de feed et sur le
  -- hero de /news/[id] (le body reste le contenu complet rendu sur le détail).
  subtitle    text,
  body        jsonb not null default '[]'::jsonb,
  -- Cible mise en avant. ref_id reste `text` car il porte aussi bien un uuid
  -- (feed_entry / sheet) qu'un isbn (book).
  ref_kind    text check (ref_kind in ('feed_entry', 'book', 'sheet')),
  ref_id      text,
  -- Avis mis en avant : l'avis précis (template custom + deep-link surligné).
  review_id   uuid references public.book_reviews(id) on delete set null,
  cover_url   text,
  cta         jsonb,  -- { label, deeplink } | null
  status      text not null default 'draft'
                check (status in ('draft', 'published', 'archived')),
  pinned      boolean not null default false,
  priority    int not null default 0,
  -- publish_at : date d'entrée en ligne (future ⇒ programmé). expire_at :
  -- retrait auto optionnel (utile pour annonces d'event / promo temporaire).
  publish_at  timestamptz not null default now(),
  expire_at   timestamptz,
  author_id   uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Tri du feed : pinned d'abord, puis priorité, puis fraîcheur. L'index couvre
-- le filtre de visibilité + l'ordre.
create index if not exists editorial_posts_feed_idx
  on public.editorial_posts (status, publish_at desc, pinned desc, priority desc);

create or replace function public.editorial_posts_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists editorial_posts_updated_at on public.editorial_posts;
create trigger editorial_posts_updated_at
  before update on public.editorial_posts
  for each row
  execute function public.editorial_posts_set_updated_at();

-- ═══════════════ 2. RLS + grants ═══════════════

alter table public.editorial_posts enable row level security;

-- SELECT : un user voit les posts en ligne (publiés, fenêtre publish/expire) ;
-- un admin voit tout (drafts, programmés, archivés, expirés).
drop policy if exists "editorial_posts read" on public.editorial_posts;
create policy "editorial_posts read"
  on public.editorial_posts
  for select
  to authenticated
  using (
    (
      status = 'published'
      and publish_at <= now()
      and (expire_at is null or expire_at > now())
    )
    or public.is_caller_admin()
  );

-- INSERT/UPDATE/DELETE : admins uniquement (pattern release_notes / catalogs).
drop policy if exists "editorial_posts admin write" on public.editorial_posts;
create policy "editorial_posts admin write"
  on public.editorial_posts
  for all
  to authenticated
  using (public.is_caller_admin())
  with check (public.is_caller_admin());

grant insert, update, delete on public.editorial_posts to authenticated;

-- ═══════════════ 3. RPC lecture ═══════════════
-- Le feed éditorial est de faible volume → pas de pagination curseur en v1 :
-- un seul fetch renvoie les posts en ligne, triés. L'app sépare ensuite les
-- `pinned` (carrousel « À la une ») du reste (cartes intercalées dans le feed).

create or replace function public.get_editorial_feed(p_limit int default 50)
returns setof public.editorial_posts
language sql
stable
security definer
set search_path = public
as $$
  select *
    from public.editorial_posts
   where status = 'published'
     and publish_at <= now()
     and (expire_at is null or expire_at > now())
   order by pinned desc, priority desc, publish_at desc, created_at desc
   limit greatest(1, least(p_limit, 100));
$$;

grant execute on function public.get_editorial_feed(int) to authenticated;

-- ═══════════════ 4. Bucket Storage `editorial-assets` ═══════════════
-- Couvertures + images des blocs `image` du body. Pattern aligné sur 0066
-- (release-notes-assets) : public read, écriture réservée aux admins.

insert into storage.buckets (id, name, public)
values ('editorial-assets', 'editorial-assets', true)
on conflict (id) do nothing;

drop policy if exists "editorial-assets public read" on storage.objects;
create policy "editorial-assets public read"
  on storage.objects for select
  using (bucket_id = 'editorial-assets');

drop policy if exists "editorial-assets admin insert" on storage.objects;
create policy "editorial-assets admin insert"
  on storage.objects for insert
  with check (
    bucket_id = 'editorial-assets'
    and public.is_caller_admin()
  );

drop policy if exists "editorial-assets admin update" on storage.objects;
create policy "editorial-assets admin update"
  on storage.objects for update
  using (
    bucket_id = 'editorial-assets'
    and public.is_caller_admin()
  );

drop policy if exists "editorial-assets admin delete" on storage.objects;
create policy "editorial-assets admin delete"
  on storage.objects for delete
  using (
    bucket_id = 'editorial-assets'
    and public.is_caller_admin()
  );

-- ═══════════════ 5. Candidats à la mise en avant ═══════════════
--
-- RPC admin (SECURITY DEFINER + gate is_caller_admin) qui classe, sur un mois
-- calendaire, les contenus candidats à une mise en avant éditoriale. 4 sources
-- (cf. décision produit) :
--   - book   : livres les plus AJOUTÉS (user_books.created_at)           → /book/[isbn]
--   - review : avis les plus VOTÉS (book_reviews_votes, somme nette)      → /book/[isbn]
--   - sheet  : fiches publiques les plus LIKÉES (réactions sur la fiche)  → /sheet/view/[id]
--   - feed   : publications (avis/fiches partagés) les plus LIKÉES        → /feed/[entryId]
--             (réactions sur l'entrée de feed elle-même)
--
-- Chaque ligne porte un `kind` featured_* suggéré + (ref_kind, ref_id) prêts à
-- pré-remplir un editorial_post, plus un aperçu (titre/sous-titre/couverture/
-- auteur), la métrique, et `review_id` pour la catégorie « review » (l'avis
-- précis mis en avant). L'app route ensuite au tap via editorialHref.
--
-- Note : réactions volontairement réparties — `sheet` (réactions sur la fiche,
-- target_kind='sheet') et `feed` (réactions sur l'entrée, target_kind=
-- 'feed_entry') se recoupent partiellement, c'est assumé (deux surfaces).

create or replace function public.admin_editorial_candidates(
  p_month date default null,
  p_limit int default 8
)
returns table (
  category      text,
  kind          text,
  ref_kind      text,
  ref_id        text,
  title         text,
  subtitle      text,
  cover_url     text,
  author_name   text,
  metric_label  text,
  metric_value  bigint,
  review_id     text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_start timestamptz;
  v_end   timestamptz;
  v_limit int := greatest(1, least(p_limit, 50));
begin
  if not public.is_caller_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_start := date_trunc('month', coalesce(p_month, current_date))::timestamptz;
  v_end   := v_start + interval '1 month';

  return query
  with
  book_adds as (
    select ub.book_isbn, count(*)::bigint as cnt
      from public.user_books ub
     where ub.created_at >= v_start and ub.created_at < v_end
     group by ub.book_isbn
  ),
  review_scores as (
    select r.id, r.book_isbn, r.comment, r.user_id,
           coalesce(sum(v.value), 0)::bigint as score
      from public.book_reviews r
      left join public.book_reviews_votes v on v.review_id = r.id
     where r.created_at >= v_start and r.created_at < v_end
     group by r.id
  ),
  sheet_likes as (
    select re.target_id as sheet_id, count(*)::bigint as likes
      from public.social_reactions re
     where re.target_kind = 'sheet'
       and re.created_at >= v_start and re.created_at < v_end
     group by re.target_id
  ),
  feed_likes as (
    select re.target_id as entry_id, count(*)::bigint as likes
      from public.social_reactions re
     where re.target_kind = 'feed_entry'
       and re.created_at >= v_start and re.created_at < v_end
     group by re.target_id
  )
  (
    select
      'book'::text, 'book_of_month'::text, 'book'::text,
      b.isbn,
      b.title,
      nullif(array_to_string(b.authors, ', '), '')::text,
      b.cover_url,
      null::text,
      'ajouts'::text,
      ba.cnt,
      null::text
    from book_adds ba
    join public.books b on b.isbn = ba.book_isbn
    order by ba.cnt desc
    limit v_limit
  )
  union all
  (
    select
      'review'::text, 'featured_review'::text, 'book'::text,
      rs.book_isbn,
      b.title,
      nullif(left(coalesce(rs.comment, ''), 140), '')::text,
      b.cover_url,
      prof.display_name,
      'votes'::text,
      rs.score,
      rs.id::text
    from review_scores rs
    join public.books b on b.isbn = rs.book_isbn
    left join public.profiles prof on prof.id = rs.user_id
    order by rs.score desc
    limit v_limit
  )
  union all
  (
    select
      'sheet'::text, 'featured_sheet'::text, 'sheet'::text,
      sl.sheet_id::text,
      b.title,
      prof.display_name,
      b.cover_url,
      prof.display_name,
      'likes'::text,
      sl.likes,
      null::text
    from sheet_likes sl
    join public.reading_sheets rsh on rsh.id = sl.sheet_id
      and rsh.is_public = true and rsh.removed_at is null
    join public.user_books ub on ub.id = rsh.user_book_id
    join public.books b on b.isbn = ub.book_isbn
    left join public.profiles prof on prof.id = ub.user_id
    order by sl.likes desc
    limit v_limit
  )
  union all
  (
    select
      'feed'::text,
      (case fe.verb when 'posted_review' then 'featured_review'
                    when 'shared_sheet'  then 'featured_sheet' end)::text,
      'feed_entry'::text,
      fl.entry_id::text,
      coalesce(b.title, 'Publication'),
      coalesce(nullif(fe.meta->>'post_text', ''), prof.display_name)::text,
      b.cover_url,
      prof.display_name,
      'likes'::text,
      fl.likes,
      null::text
    from feed_likes fl
    join public.social_feed_entries fe on fe.id = fl.entry_id
      and fe.removed_at is null
      and fe.visibility = 'public'
      and fe.verb in ('posted_review', 'shared_sheet')
    left join public.profiles prof on prof.id = fe.actor_id
    left join public.book_reviews br on fe.target_kind = 'review' and br.id = fe.target_id
    left join public.reading_sheets rsh on fe.target_kind = 'sheet' and rsh.id = fe.target_id
    left join public.user_books ub on ub.id = rsh.user_book_id
    left join public.books b on b.isbn = coalesce(br.book_isbn, ub.book_isbn)
    order by fl.likes desc
    limit v_limit
  );
end;
$$;

grant execute on function public.admin_editorial_candidates(date, int) to authenticated;

-- ═══════════════ 6. get_review : lecture enrichie d'un avis ═══════════════
-- Renvoie un seul avis (note + commentaire + score agrégé + snapshot auteur),
-- même forme qu'un élément de get_book_reviews.reviews. Utilisé par la carte
-- « Avis à la une » (app + aperçu admin). SECURITY DEFINER : profils/avis
-- publics, lecture sûre.

create or replace function public.get_review(p_review_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id',         r.id,
    'user_id',    r.user_id,
    'book_isbn',  r.book_isbn,
    'rating',     r.rating,
    'comment',    r.comment,
    'created_at', r.created_at,
    'updated_at', r.updated_at,
    'score',      coalesce((
      select sum(v.value)::int
        from public.book_reviews_votes v
       where v.review_id = r.id
    ), 0),
    'author', jsonb_build_object(
      'id',           r.user_id,
      'username',     p.username,
      'display_name', p.display_name,
      'avatar_url',   p.avatar_url,
      'is_premium',   coalesce(p.is_premium, false),
      'appearance', jsonb_strip_nulls(jsonb_build_object(
        'fontId',         p.preferences->'fontId',
        'colorPrimary',   p.preferences->'colorPrimary',
        'colorSecondary', p.preferences->'colorSecondary',
        'colorBg',        p.preferences->'colorBg',
        'borderId',       p.preferences->'borderId',
        'fondId',         p.preferences->'fondId',
        'fondOpacity',    p.preferences->'fondOpacity',
        'avatarFrameId',  p.preferences->'avatarFrameId'
      ))
    )
  )
  from public.book_reviews r
  left join public.profiles p on p.id = r.user_id
  where r.id = p_review_id;
$$;

grant execute on function public.get_review(uuid) to authenticated;
