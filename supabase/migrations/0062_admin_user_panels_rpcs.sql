-- Bascule complète de l'accès admin aux données user-scoped : SELECT directs
-- via RLS admin (cf. 0059) → RPCs SECURITY DEFINER. L'app mobile, qui partage
-- la même anon key et le même JWT que le backoffice, agrégait sinon toute
-- la base dans son store local dès qu'un user était admin.
--
-- Deux blocs dans cette migration :
--   1. RPCs `admin_user_*` (security definer, gate is_caller_admin), une par
--      panel admin. Voie d'accès unique du backoffice aux données user-scoped.
--   2. DROP des 15 policies `*_admin_select` de 0059, qui sont rendues
--      inutiles par les RPCs. Le RLS user strict (`auth.uid() = user_id`,
--      `… via user_book`, etc.) reprend la main → l'app mobile d'un admin
--      redevient sandboxée.
--
-- Les deux blocs sont dans la même transaction : pas de fenêtre où le
-- backoffice serait cassé entre les deux opérations.
--
-- Pas d'INSERT/UPDATE/DELETE côté RPCs : aucune policy admin n'autorisait
-- les writes (0059 n'a que des FOR SELECT). Donc rien à porter.
--
-- Rétropédalage : `git revert` ou recopier le bloc CREATE POLICY de 0059.

-- ═════════════ Helper ═════════════

create or replace function public._assert_admin() returns void
language plpgsql
as $$
begin
  if not public.is_caller_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;

-- ═════════════ 1. admin_user_badges ═════════════

create or replace function public.admin_user_badges(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  perform public._assert_admin();
  select coalesce(jsonb_agg(to_jsonb(ub) order by ub.earned_at desc), '[]'::jsonb)
    into v
    from public.user_badges ub
   where ub.user_id = p_user_id;
  return v;
end;
$$;

grant execute on function public.admin_user_badges(uuid) to authenticated;

-- ═════════════ 2. admin_user_books ═════════════
-- Renvoie user_books avec book imbriqué (isbn, title, authors, cover_url).

create or replace function public.admin_user_books(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  perform public._assert_admin();
  select coalesce(
    jsonb_agg(
      to_jsonb(ub) || jsonb_build_object(
        'book', case when b.isbn is null then null else jsonb_build_object(
          'isbn', b.isbn,
          'title', b.title,
          'authors', b.authors,
          'cover_url', b.cover_url
        ) end
      )
      order by ub.created_at desc
    ),
    '[]'::jsonb
  ) into v
  from public.user_books ub
  left join public.books b on b.isbn = ub.book_isbn
  where ub.user_id = p_user_id;
  return v;
end;
$$;

grant execute on function public.admin_user_books(uuid) to authenticated;

-- ═════════════ 3. admin_user_loans ═════════════

create or replace function public.admin_user_loans(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  perform public._assert_admin();
  select coalesce(
    jsonb_agg(
      to_jsonb(bl) || jsonb_build_object(
        'user_book', jsonb_build_object(
          'book_isbn', ub.book_isbn,
          'book', case when b.isbn is null then null else jsonb_build_object(
            'isbn', b.isbn,
            'title', b.title
          ) end
        )
      )
      order by bl.date_out desc
    ),
    '[]'::jsonb
  ) into v
  from public.book_loans bl
  join public.user_books ub on ub.id = bl.user_book_id
  left join public.books b on b.isbn = ub.book_isbn
  where ub.user_id = p_user_id;
  return v;
end;
$$;

grant execute on function public.admin_user_loans(uuid) to authenticated;

-- ═════════════ 4. admin_user_sessions ═════════════
-- Limite 200 (cf. sessions-panel.tsx — limit explicite côté client).

create or replace function public.admin_user_sessions(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  perform public._assert_admin();
  select coalesce(jsonb_agg(j), '[]'::jsonb) into v
  from (
    select
      to_jsonb(rs) || jsonb_build_object(
        'user_book', jsonb_build_object(
          'book_isbn', ub.book_isbn,
          'book', case when b.isbn is null then null else jsonb_build_object(
            'isbn', b.isbn,
            'title', b.title
          ) end
        )
      ) as j
    from public.reading_sessions rs
    join public.user_books ub on ub.id = rs.user_book_id
    left join public.books b on b.isbn = ub.book_isbn
    where ub.user_id = p_user_id
    order by rs.started_at desc
    limit 200
  ) t;
  return v;
end;
$$;

grant execute on function public.admin_user_sessions(uuid) to authenticated;

-- ═════════════ 5. admin_user_sheets ═════════════

create or replace function public.admin_user_sheets(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  perform public._assert_admin();
  select coalesce(
    jsonb_agg(
      to_jsonb(rs) || jsonb_build_object(
        'user_book', jsonb_build_object(
          'id', ub.id,
          'book_isbn', ub.book_isbn,
          'book', case when b.isbn is null then null else jsonb_build_object(
            'isbn', b.isbn,
            'title', b.title,
            'cover_url', b.cover_url
          ) end
        )
      )
      order by rs.updated_at desc
    ),
    '[]'::jsonb
  ) into v
  from public.reading_sheets rs
  join public.user_books ub on ub.id = rs.user_book_id
  left join public.books b on b.isbn = ub.book_isbn
  where ub.user_id = p_user_id;
  return v;
end;
$$;

grant execute on function public.admin_user_sheets(uuid) to authenticated;

-- ═════════════ 6. admin_user_challenges ═════════════
-- Regroupe les 4 queries du ChallengesPanel en un seul appel :
--   - bingos du user
--   - completions de ses bingos
--   - reading_streak_days (120 dernières)
--   - reading_challenges (défis annuels)
--   - read_by_year : nb de livres terminés par année (pour calculer le %).

create or replace function public.admin_user_challenges(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  perform public._assert_admin();
  select jsonb_build_object(
    'bingos', coalesce(
      (select jsonb_agg(to_jsonb(bi) order by bi.created_at desc)
         from public.bingos bi
        where bi.user_id = p_user_id),
      '[]'::jsonb
    ),
    'completions', coalesce(
      (select jsonb_agg(to_jsonb(bc))
         from public.bingo_completions bc
         join public.bingos bi on bi.id = bc.bingo_id
        where bi.user_id = p_user_id),
      '[]'::jsonb
    ),
    'streak_days', coalesce(
      (select jsonb_agg(to_jsonb(sd) order by sd.day desc)
         from (
           select day, goal_minutes, created_at, user_id
             from public.reading_streak_days
            where user_id = p_user_id
            order by day desc
            limit 120
         ) sd),
      '[]'::jsonb
    ),
    'annual_challenges', coalesce(
      (select jsonb_agg(to_jsonb(rc) order by rc.year desc)
         from public.reading_challenges rc
        where rc.user_id = p_user_id),
      '[]'::jsonb
    ),
    'read_by_year', coalesce(
      (select jsonb_object_agg(y::text, c)
         from (
           select extract(year from ub.finished_at)::int as y, count(*) as c
             from public.user_books ub
            where ub.user_id = p_user_id
              and ub.status = 'read'
              and ub.finished_at is not null
            group by 1
         ) g),
      '{}'::jsonb
    )
  ) into v;
  return v;
end;
$$;

grant execute on function public.admin_user_challenges(uuid) to authenticated;

-- ═════════════ 7. admin_user_overview ═════════════
-- Renvoie l'activité récente d'un user :
--   - feed (social_feed_entries) limit 12
--   - added_books (user_books, status + book) limit 12
--   - comments (social_comments du user) limit 12
--   - target_info : labels + auteurs des cibles des commentaires, résolus
--     côté serveur. Cela ferme le besoin de SELECT cross-user sur sheets/
--     reviews/comments/bingos/feed_entries/profiles dans le backoffice.
--
-- target_info est un mapping "kind:id" -> { label, author_user_id,
-- author_label }. Le panel TS construit la TargetInfoMap à partir de là
-- sans plus toucher Supabase pour la résolution.

create or replace function public.admin_user_overview(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_feed jsonb;
  v_books jsonb;
  v_comments jsonb;
  v_target_info jsonb;
begin
  perform public._assert_admin();

  -- Feed
  select coalesce(jsonb_agg(to_jsonb(f) order by f.created_at desc), '[]'::jsonb)
    into v_feed
    from (
      select *
        from public.social_feed_entries
       where actor_id = p_user_id
       order by created_at desc
       limit 12
    ) f;

  -- Books ajoutés
  select coalesce(jsonb_agg(j order by j_created_at desc), '[]'::jsonb)
    into v_books
    from (
      select
        jsonb_build_object(
          'id', ub.id,
          'book_isbn', ub.book_isbn,
          'status', ub.status,
          'created_at', ub.created_at,
          'book', case when b.isbn is null then null else jsonb_build_object(
            'isbn', b.isbn,
            'title', b.title
          ) end
        ) as j,
        ub.created_at as j_created_at
      from public.user_books ub
      left join public.books b on b.isbn = ub.book_isbn
      where ub.user_id = p_user_id
      order by ub.created_at desc
      limit 12
    ) t;

  -- Comments
  select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc), '[]'::jsonb)
    into v_comments
    from (
      select id, target_kind, target_id, parent_id, body, deleted_at, created_at
        from public.social_comments
       where user_id = p_user_id
       order by created_at desc
       limit 12
    ) c;

  -- Target info (résolution cross-user des cibles des commentaires)
  with comment_targets as (
    select distinct target_kind, target_id
      from public.social_comments
     where user_id = p_user_id
     order by 1, 2
     limit 60 -- worst case 12 comments * pas plus de 5 kinds distincts
  ),
  sheets_info as (
    select 'sheet:' || rs.id::text as key,
           coalesce(b.title, '(sans titre)') as label,
           ub.user_id as author_user_id
      from public.reading_sheets rs
      join public.user_books ub on ub.id = rs.user_book_id
      left join public.books b on b.isbn = ub.book_isbn
     where rs.id in (
       select target_id from comment_targets where target_kind = 'sheet'
     )
  ),
  reviews_info as (
    select 'review:' || br.id::text as key,
           coalesce(b.title, '(sans titre)') as label,
           br.user_id as author_user_id
      from public.book_reviews br
      left join public.books b on b.isbn = br.book_isbn
     where br.id in (
       select target_id from comment_targets where target_kind = 'review'
     )
  ),
  comments_info as (
    select 'comment:' || sc.id::text as key,
           -- excerpt court (60 chars, ellipsis géré côté TS si besoin)
           left(sc.body, 60) as label,
           sc.user_id as author_user_id
      from public.social_comments sc
     where sc.id in (
       select target_id from comment_targets where target_kind = 'comment'
     )
  ),
  bingos_info as (
    select 'bingo:' || bi.id::text as key,
           bi.title as label,
           bi.user_id as author_user_id
      from public.bingos bi
     where bi.id in (
       select target_id from comment_targets where target_kind = 'bingo'
     )
  ),
  feed_info as (
    select 'feed_entry:' || sfe.id::text as key,
           sfe.verb as label,
           sfe.actor_id as author_user_id
      from public.social_feed_entries sfe
     where sfe.id in (
       select target_id from comment_targets where target_kind = 'feed_entry'
     )
  ),
  all_info as (
    select * from sheets_info
    union all select * from reviews_info
    union all select * from comments_info
    union all select * from bingos_info
    union all select * from feed_info
  ),
  authors as (
    select p.id, coalesce(p.display_name, p.username, '(profil sans nom)') as label
      from public.profiles p
     where p.id in (select author_user_id from all_info where author_user_id is not null)
  )
  select coalesce(
    jsonb_object_agg(
      a.key,
      jsonb_build_object(
        'label', a.label,
        'author_user_id', a.author_user_id,
        'author_label', au.label
      )
    ),
    '{}'::jsonb
  ) into v_target_info
  from all_info a
  left join authors au on au.id = a.author_user_id;

  return jsonb_build_object(
    'feed', v_feed,
    'added_books', v_books,
    'comments', v_comments,
    'target_info', coalesce(v_target_info, '{}'::jsonb)
  );
end;
$$;

grant execute on function public.admin_user_overview(uuid) to authenticated;

-- ═════════════ Drop des policies admin select de 0059 ═════════════
-- Plus de SELECT direct côté admin → ces policies n'ont plus d'utilité, et
-- elles laissaient l'app mobile d'un admin télécharger toute la base.

drop policy if exists "profiles admin select" on public.profiles;
drop policy if exists "user_books admin select" on public.user_books;
drop policy if exists "reading_sessions admin select" on public.reading_sessions;
drop policy if exists "book_loans admin select" on public.book_loans;
drop policy if exists "reading_sheets admin select" on public.reading_sheets;
drop policy if exists "bingos admin select" on public.bingos;
drop policy if exists "bingo_completions admin select" on public.bingo_completions;
drop policy if exists "reading_challenges admin select" on public.reading_challenges;
drop policy if exists "reading_streak_days admin select" on public.reading_streak_days;
drop policy if exists "user_badges admin select" on public.user_badges;
drop policy if exists "user_borders admin select" on public.user_borders;
drop policy if exists "user_fonds admin select" on public.user_fonds;
drop policy if exists "user_avatar_frames admin select" on public.user_avatar_frames;
drop policy if exists "social_feed_entries admin select" on public.social_feed_entries;
drop policy if exists "book_reviews admin select" on public.book_reviews;
