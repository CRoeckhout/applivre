-- 0059 — Admin users access
-- Donne aux profils `is_admin = true` la lecture cross-user sur l'ensemble
-- des données utilisateur (livres, sessions, fiches, défis, prêts, badges,
-- décorations, activités social), pour alimenter la section "Utilisateurs"
-- de l'admin web.
--
-- 3 blocs :
--   1. Helper `is_caller_admin()` SECURITY DEFINER. Évite la récursion RLS
--      qu'aurait un sub-select `select 1 from profiles where is_admin` dans
--      la policy `profiles admin select` (le sub-select déclencherait la
--      même policy → boucle). Bonus : un seul lookup mémoïsé par query
--      plan, plus rapide que 15 sub-selects identiques.
--   2. Policies admin SELECT sur les 15 tables user. Self-policies (0001)
--      conservées : un user normal voit toujours ses données ; les writes
--      restent self-only (V1 admin = lecture seule).
--   3. Trigger garde-fou `profiles.is_admin` : la policy "profiles self"
--      autorise par défaut l'écriture de toutes les colonnes propres → un
--      user malveillant pourrait s'auto-promouvoir admin via le client.
--      Le trigger rejette toute modif de `is_admin` sauf depuis
--      `service_role`. Note : `is_premium` / `premium_until` ont la même
--      problématique (cf. 0041, alimentés par webhook RevenueCat via
--      service_role) — pas inclus ici, à verrouiller en phase 3.
--
-- L'email reste accessible uniquement via RPC SECURITY DEFINER qui joint
-- `auth.users` (cf. 0034 pour le pattern). Cette migration ajoute
-- `admin_users_list` pour le listing avec recherche / filtres / tri /
-- pagination, et qui agrège les compteurs et la dernière activité.

-- ═════════════ 1. Helper is_caller_admin ═════════════

create or replace function public.is_caller_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

grant execute on function public.is_caller_admin() to authenticated, anon;

-- ═════════════ 2. Policies admin SELECT ═════════════

drop policy if exists "profiles admin select" on public.profiles;
create policy "profiles admin select" on public.profiles
  for select to authenticated
  using (public.is_caller_admin());

drop policy if exists "user_books admin select" on public.user_books;
create policy "user_books admin select" on public.user_books
  for select to authenticated
  using (public.is_caller_admin());

drop policy if exists "reading_sessions admin select" on public.reading_sessions;
create policy "reading_sessions admin select" on public.reading_sessions
  for select to authenticated
  using (public.is_caller_admin());

drop policy if exists "book_loans admin select" on public.book_loans;
create policy "book_loans admin select" on public.book_loans
  for select to authenticated
  using (public.is_caller_admin());

drop policy if exists "reading_sheets admin select" on public.reading_sheets;
create policy "reading_sheets admin select" on public.reading_sheets
  for select to authenticated
  using (public.is_caller_admin());

drop policy if exists "bingos admin select" on public.bingos;
create policy "bingos admin select" on public.bingos
  for select to authenticated
  using (public.is_caller_admin());

drop policy if exists "bingo_completions admin select" on public.bingo_completions;
create policy "bingo_completions admin select" on public.bingo_completions
  for select to authenticated
  using (public.is_caller_admin());

drop policy if exists "reading_challenges admin select" on public.reading_challenges;
create policy "reading_challenges admin select" on public.reading_challenges
  for select to authenticated
  using (public.is_caller_admin());

drop policy if exists "reading_streak_days admin select" on public.reading_streak_days;
create policy "reading_streak_days admin select" on public.reading_streak_days
  for select to authenticated
  using (public.is_caller_admin());

drop policy if exists "user_badges admin select" on public.user_badges;
create policy "user_badges admin select" on public.user_badges
  for select to authenticated
  using (public.is_caller_admin());

drop policy if exists "user_borders admin select" on public.user_borders;
create policy "user_borders admin select" on public.user_borders
  for select to authenticated
  using (public.is_caller_admin());

drop policy if exists "user_fonds admin select" on public.user_fonds;
create policy "user_fonds admin select" on public.user_fonds
  for select to authenticated
  using (public.is_caller_admin());

drop policy if exists "user_avatar_frames admin select" on public.user_avatar_frames;
create policy "user_avatar_frames admin select" on public.user_avatar_frames
  for select to authenticated
  using (public.is_caller_admin());

drop policy if exists "social_feed_entries admin select" on public.social_feed_entries;
create policy "social_feed_entries admin select" on public.social_feed_entries
  for select to authenticated
  using (public.is_caller_admin());

drop policy if exists "book_reviews admin select" on public.book_reviews;
create policy "book_reviews admin select" on public.book_reviews
  for select to authenticated
  using (public.is_caller_admin());

-- ═════════════ 3. Trigger : protection de profiles.is_admin ═════════════

create or replace function public.guard_profiles_is_admin()
returns trigger
language plpgsql
as $$
begin
  if new.is_admin is distinct from old.is_admin
     and coalesce(auth.role(), 'anon') <> 'service_role' then
    raise exception 'profiles.is_admin can only be changed via service_role'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_is_admin on public.profiles;
create trigger profiles_protect_is_admin
  before update on public.profiles
  for each row
  execute function public.guard_profiles_is_admin();

-- ═════════════ 4. RPC admin_users_list ═════════════
-- Listing paginé avec recherche full-text simple, filtres premium/admin/
-- actifs (activité < 30j), tri (activity|created|username), et pagination
-- limit/offset. Retourne aussi `total_count` (count(*) over ()) pour pouvoir
-- afficher "X / N" dans la sidebar sans round-trip COUNT séparé.
--
-- Joint `auth.users` pour récupérer l'email — l'admin a un usage légitime
-- (support, RGPD). Gate `is_admin = true` strict.
--
-- last_activity_at = max sur reading_sessions.started_at,
-- reading_sheets.updated_at, social_feed_entries.created_at. Si tout est
-- null, on retombe sur created_at pour avoir une valeur.

create or replace function public.admin_users_list(
  p_search text default null,
  p_only_premium boolean default false,
  p_only_admin boolean default false,
  p_only_active boolean default false,
  p_sort text default 'activity',
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  user_id uuid,
  email text,
  username text,
  display_name text,
  avatar_url text,
  is_premium boolean,
  is_admin boolean,
  account_created_at timestamptz,
  last_activity_at timestamptz,
  books_count bigint,
  sheets_count bigint,
  total_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_search_pattern text;
begin
  if not public.is_caller_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_search_pattern := case
    when p_search is null or length(trim(p_search)) = 0 then null
    else '%' || lower(trim(p_search)) || '%'
  end;

  return query
  with base as (
    select
      p.id as user_id,
      u.email::text as email,
      p.username,
      p.display_name,
      p.avatar_url,
      coalesce(p.is_premium, false) as is_premium,
      coalesce(p.is_admin, false) as is_admin,
      p.created_at as account_created_at,
      greatest(
        p.created_at,
        (select max(rs.started_at)
           from public.reading_sessions rs
           join public.user_books ub on ub.id = rs.user_book_id
          where ub.user_id = p.id),
        (select max(rsh.updated_at)
           from public.reading_sheets rsh
           join public.user_books ub on ub.id = rsh.user_book_id
          where ub.user_id = p.id),
        (select max(sfe.created_at)
           from public.social_feed_entries sfe
          where sfe.actor_id = p.id)
      ) as last_activity_at,
      (select count(*) from public.user_books ub where ub.user_id = p.id) as books_count,
      (select count(*) from public.reading_sheets rsh
         join public.user_books ub on ub.id = rsh.user_book_id
        where ub.user_id = p.id) as sheets_count
    from public.profiles p
    left join auth.users u on u.id = p.id
  ),
  filtered as (
    select *
    from base b
    where (v_search_pattern is null
           or lower(coalesce(b.username, '')) like v_search_pattern
           or lower(coalesce(b.display_name, '')) like v_search_pattern
           or lower(coalesce(b.email, '')) like v_search_pattern)
      and (not p_only_premium or b.is_premium = true)
      and (not p_only_admin or b.is_admin = true)
      and (not p_only_active or b.last_activity_at >= now() - interval '30 days')
  )
  select
    f.user_id,
    f.email,
    f.username,
    f.display_name,
    f.avatar_url,
    f.is_premium,
    f.is_admin,
    f.account_created_at,
    f.last_activity_at,
    f.books_count,
    f.sheets_count,
    count(*) over () as total_count
  from filtered f
  order by
    case when p_sort = 'activity' then f.last_activity_at end desc nulls last,
    case when p_sort = 'created'  then f.account_created_at end desc nulls last,
    case when p_sort = 'username' then lower(coalesce(f.username, f.display_name, '')) end asc,
    f.user_id
  limit greatest(1, least(p_limit, 200))
  offset greatest(0, p_offset);
end;
$$;

grant execute on function public.admin_users_list(text, boolean, boolean, boolean, text, int, int) to authenticated;
