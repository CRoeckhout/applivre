-- 0068 — Templates de fiches de lecture, partageables à la communauté.
--
-- Permet aux users de capitaliser sur une fiche réussie (visuel + structure)
-- pour la réutiliser sur plusieurs livres ou la partager. Distinct de
-- `reading_sheets` (qui est lié à un livre) : un template n'a pas de
-- `user_book_id`, on le projette au moment de créer une fiche.
--
-- Stratégie de partage : `is_public` simple. Pas de modération a priori,
-- une colonne `reported_count` réservée pour brancher un futur "signaler".
--
-- Bookmark : pas de table. Cliquer "Sauvegarder dans mes templates" sur un
-- template communautaire CLONE la row en plaçant `forked_from_id` pour
-- créditer l'original. L'utilisateur devient propriétaire de sa copie.

-- ═════════════ Table principale ═════════════

create table if not exists public.reading_sheets_templates (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 80),
  -- jsonb miroir du content des reading_sheets : { appearance, sections,
  -- stickers }. Pas de champ `sections[].body` rempli (template = squelette).
  -- Le mappeur côté app projette ce content vers une ReadingSheet à la
  -- création d'une fiche.
  content         jsonb not null default '{}'::jsonb,
  -- Genres prédéfinis (cf. reading_sheets_template_genres). text[] pour
  -- index GIN sur la recherche multi-tag. Pas de FK pour éviter une table
  -- de jointure ; l'admin garantit la cohérence via l'éditeur.
  genres          text[] not null default '{}',
  is_public       boolean not null default false,
  -- Calculé/mis à jour côté app au save : true si le template embarque ≥1
  -- sticker/cadre/fond premium. Permet de gater l'usage en freemium sans
  -- ouvrir le content jsonb à chaque lecture. Recalculable via la RPC
  -- `recompute_template_is_premium` si les catalogues changent.
  is_premium      boolean not null default false,
  likes_count     integer not null default 0 check (likes_count >= 0),
  forked_from_id  uuid references public.reading_sheets_templates(id) on delete set null,
  reported_count  integer not null default 0 check (reported_count >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists reading_sheets_templates_user_idx
  on public.reading_sheets_templates (user_id, updated_at desc);
create index if not exists reading_sheets_templates_public_idx
  on public.reading_sheets_templates (is_public, updated_at desc) where is_public = true;
create index if not exists reading_sheets_templates_genres_idx
  on public.reading_sheets_templates using gin (genres) where is_public = true;
create index if not exists reading_sheets_templates_likes_idx
  on public.reading_sheets_templates (likes_count desc) where is_public = true;

create or replace function public._touch_reading_sheets_templates_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists reading_sheets_templates_touch on public.reading_sheets_templates;
create trigger reading_sheets_templates_touch
before update on public.reading_sheets_templates
for each row execute function public._touch_reading_sheets_templates_updated_at();

-- ═════════════ Genres prédéfinis ═════════════
-- Liste figée, éditable depuis le panel admin (PR future). Slugs en
-- ASCII lower kebab-case pour servir de clé stable côté app.

create table if not exists public.reading_sheets_template_genres (
  slug        text primary key check (slug = lower(slug) and slug ~ '^[a-z0-9-]+$'),
  label       text not null check (char_length(label) between 1 and 60),
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists reading_sheets_template_genres_active_idx
  on public.reading_sheets_template_genres (is_active, sort_order);

-- Seed initial : 15 genres communs. Idempotent via on conflict.
insert into public.reading_sheets_template_genres (slug, label, sort_order) values
  ('romance',       'Romance',         10),
  ('fantasy',       'Fantaisie',       20),
  ('horror',        'Horreur',         30),
  ('sci-fi',        'Science-fiction', 40),
  ('thriller',      'Thriller',        50),
  ('mystery',       'Polar',           60),
  ('contemporary',  'Contemporain',    70),
  ('classic',       'Classique',       80),
  ('young-adult',   'Jeunesse',        90),
  ('comics',        'BD',             100),
  ('manga',         'Manga',          110),
  ('essay',         'Essai',          120),
  ('biography',     'Biographie',     130),
  ('self-help',     'Développement perso', 140),
  ('poetry',        'Poésie',         150)
  on conflict (slug) do nothing;

-- ═════════════ Likes ═════════════

create table if not exists public.reading_sheets_template_likes (
  user_id      uuid not null references auth.users(id) on delete cascade,
  template_id  uuid not null references public.reading_sheets_templates(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (user_id, template_id)
);

create index if not exists reading_sheets_template_likes_template_idx
  on public.reading_sheets_template_likes (template_id);

-- Trigger : maintient likes_count dénormalisé sur la table principale.
create or replace function public._sync_reading_sheets_template_likes_count()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    update public.reading_sheets_templates
       set likes_count = likes_count + 1
     where id = new.template_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.reading_sheets_templates
       set likes_count = greatest(likes_count - 1, 0)
     where id = old.template_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists reading_sheets_template_likes_count_ins on public.reading_sheets_template_likes;
create trigger reading_sheets_template_likes_count_ins
after insert on public.reading_sheets_template_likes
for each row execute function public._sync_reading_sheets_template_likes_count();

drop trigger if exists reading_sheets_template_likes_count_del on public.reading_sheets_template_likes;
create trigger reading_sheets_template_likes_count_del
after delete on public.reading_sheets_template_likes
for each row execute function public._sync_reading_sheets_template_likes_count();

-- ═════════════ RLS ═════════════

alter table public.reading_sheets_templates enable row level security;
alter table public.reading_sheets_template_genres enable row level security;
alter table public.reading_sheets_template_likes enable row level security;

-- Templates : lecture si public OU propriétaire. Écriture propriétaire only.
drop policy if exists "reading_sheets_templates read" on public.reading_sheets_templates;
create policy "reading_sheets_templates read" on public.reading_sheets_templates
  for select
  using (is_public = true or user_id = auth.uid());

drop policy if exists "reading_sheets_templates write owner" on public.reading_sheets_templates;
create policy "reading_sheets_templates write owner" on public.reading_sheets_templates
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Genres : lecture publique (drawer recherche). Écriture admin only.
drop policy if exists "reading_sheets_template_genres read" on public.reading_sheets_template_genres;
create policy "reading_sheets_template_genres read" on public.reading_sheets_template_genres
  for select using (true);

drop policy if exists "reading_sheets_template_genres admin write" on public.reading_sheets_template_genres;
create policy "reading_sheets_template_genres admin write" on public.reading_sheets_template_genres
  for all
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

-- Likes : lecture publique (pour afficher "j'ai liké"). Écriture self-only.
drop policy if exists "reading_sheets_template_likes read" on public.reading_sheets_template_likes;
create policy "reading_sheets_template_likes read" on public.reading_sheets_template_likes
  for select using (true);

drop policy if exists "reading_sheets_template_likes self write" on public.reading_sheets_template_likes;
create policy "reading_sheets_template_likes self write" on public.reading_sheets_template_likes
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ═════════════ RPCs galerie communautaire ═════════════

-- Liste des templates publics avec filtres + tri. Pagination keyset
-- (limit/offset). Inclut creator basics + is_liked pour l'auth user
-- (false pour anon) afin d'éviter une 2nde requête côté client.
--
-- p_sort :
--   'popular' (default) — placeholder, alias de 'recent' tant qu'on
--   n'a pas de relation usages (cf. décision : pas de relation en base).
--   'recent'            — updated_at desc.
--   'liked'             — likes_count desc.
--
-- p_include_premium : si false, on masque les templates marqués premium
--   (utile en freemium si l'user décoche la case "Premium" du drawer).
create or replace function public.list_public_templates(
  p_search          text default null,
  p_genres          text[] default null,
  p_sort            text default 'popular',
  p_include_premium boolean default true,
  p_creator_id      uuid default null,
  p_limit           integer default 30,
  p_offset          integer default 0
)
returns table (
  template_id     uuid,
  user_id         uuid,
  name            text,
  content         jsonb,
  genres          text[],
  is_premium      boolean,
  likes_count     integer,
  forked_from_id  uuid,
  created_at      timestamptz,
  updated_at      timestamptz,
  creator_display_name text,
  creator_avatar_url   text,
  creator_username     text,
  is_liked        boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id            as template_id,
    t.user_id,
    t.name,
    t.content,
    t.genres,
    t.is_premium,
    t.likes_count,
    t.forked_from_id,
    t.created_at,
    t.updated_at,
    p.display_name  as creator_display_name,
    p.avatar_url    as creator_avatar_url,
    p.username      as creator_username,
    exists (
      select 1 from public.reading_sheets_template_likes l
       where l.template_id = t.id and l.user_id = auth.uid()
    ) as is_liked
  from public.reading_sheets_templates t
  join public.profiles p on p.id = t.user_id
  where t.is_public = true
    and (p_creator_id is null or t.user_id = p_creator_id)
    and (p_include_premium or t.is_premium = false)
    and (
      p_search is null or p_search = ''
      or t.name ilike '%' || p_search || '%'
      or p.display_name ilike '%' || p_search || '%'
      or p.username ilike '%' || p_search || '%'
    )
    and (
      p_genres is null or array_length(p_genres, 1) is null
      or t.genres && p_genres
    )
  order by
    case when p_sort = 'liked' then t.likes_count end desc nulls last,
    case when p_sort = 'recent' or p_sort = 'popular' then t.updated_at end desc nulls last,
    t.id desc
  limit greatest(coalesce(p_limit, 30), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

grant execute on function public.list_public_templates(text, text[], text, boolean, uuid, integer, integer) to authenticated;

-- Bundle unitaire (preview avec creator info).
create or replace function public.get_public_template(p_template_id uuid)
returns table (
  template_id     uuid,
  user_id         uuid,
  name            text,
  content         jsonb,
  genres          text[],
  is_public       boolean,
  is_premium      boolean,
  likes_count     integer,
  forked_from_id  uuid,
  created_at      timestamptz,
  updated_at      timestamptz,
  creator_display_name text,
  creator_avatar_url   text,
  creator_username     text,
  is_liked        boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id            as template_id,
    t.user_id,
    t.name,
    t.content,
    t.genres,
    t.is_public,
    t.is_premium,
    t.likes_count,
    t.forked_from_id,
    t.created_at,
    t.updated_at,
    p.display_name  as creator_display_name,
    p.avatar_url    as creator_avatar_url,
    p.username      as creator_username,
    exists (
      select 1 from public.reading_sheets_template_likes l
       where l.template_id = t.id and l.user_id = auth.uid()
    ) as is_liked
  from public.reading_sheets_templates t
  join public.profiles p on p.id = t.user_id
  where t.id = p_template_id
    and (t.is_public = true or t.user_id = auth.uid());
$$;

grant execute on function public.get_public_template(uuid) to authenticated;

-- Clone (côté serveur pour garantir l'intégrité du forked_from_id et que
-- la copie devient bien propriété de l'appelant — sinon un user pourrait
-- forger un forked_from_id sur une création arbitraire).
create or replace function public.clone_reading_sheets_template(p_template_id uuid, p_name text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_id uuid;
  v_src public.reading_sheets_templates%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into v_src
    from public.reading_sheets_templates
   where id = p_template_id
     and (is_public = true or user_id = auth.uid());

  if not found then
    raise exception 'template not found or not accessible';
  end if;

  insert into public.reading_sheets_templates
    (user_id, name, content, genres, is_public, is_premium, forked_from_id)
  values
    (auth.uid(),
     coalesce(nullif(trim(p_name), ''), v_src.name),
     v_src.content,
     v_src.genres,
     false,             -- la copie est privée par défaut
     v_src.is_premium,
     v_src.id)
  returning id into v_new_id;

  return v_new_id;
end;
$$;

grant execute on function public.clone_reading_sheets_template(uuid, text) to authenticated;

-- Grants tables (RLS gère le périmètre).
grant select, insert, update, delete on public.reading_sheets_templates to authenticated;
grant select on public.reading_sheets_template_genres to anon, authenticated;
grant insert, update, delete on public.reading_sheets_template_genres to authenticated;
grant select, insert, delete on public.reading_sheets_template_likes to authenticated;
