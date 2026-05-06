-- 0056 — Découverte d'utilisateurs : recherche par username + recommandations.
--
-- 2 fonctions SECURITY DEFINER qui retournent la même shape (DiscoveredUser
-- côté client). Aligné sur la whitelist de get_public_profiles (cf. 0048) +
-- 2 stats publiques pour donner du contexte avant de suivre :
--   - follower_count       : nombre d'abonnés
--   - public_sheets_count  : nombre de fiches publiées
--
-- Les deux excluent l'utilisateur courant. recommend_users exclut en plus
-- les comptes déjà suivis (sinon le bouton "Suivre" serait mensonger).

create or replace function public.search_users_by_username(
  p_query text,
  p_limit int default 20
)
returns table (
  id                  uuid,
  username            text,
  display_name        text,
  avatar_url          text,
  is_premium          boolean,
  appearance          jsonb,
  badge_keys          text[],
  follower_count      integer,
  public_sheets_count integer
)
language sql
security definer
set search_path = public
stable
as $$
  with me as (select auth.uid() as uid)
  select
    p.id,
    p.username,
    p.display_name,
    p.avatar_url,
    coalesce(p.is_premium, false),
    jsonb_strip_nulls(jsonb_build_object(
      'fontId',         p.preferences->'fontId',
      'colorPrimary',   p.preferences->'colorPrimary',
      'colorSecondary', p.preferences->'colorSecondary',
      'colorBg',        p.preferences->'colorBg',
      'borderId',       p.preferences->'borderId',
      'fondId',         p.preferences->'fondId',
      'fondOpacity',    p.preferences->'fondOpacity',
      'avatarFrameId',  p.preferences->'avatarFrameId'
    )),
    coalesce(
      (
        select array_agg(badge_key order by earned_at desc)
        from public.user_badges
        where user_id = p.id
      ),
      array[]::text[]
    ),
    (
      select count(*)::int
      from public.social_follows
      where followed_id = p.id
    ),
    (
      select count(*)::int
      from public.reading_sheets rs
      join public.user_books    ub on ub.id = rs.user_book_id
      where ub.user_id = p.id and rs.is_public = true
    )
  from public.profiles p
  where p.username is not null
    and p.id <> (select uid from me)
    -- Match : username contient la query (case-insensitive). Pas de
    -- prefix-only — un user qui se rappelle d'un fragment trouve quand même.
    and (
      p_query = ''
      or position(lower(p_query) in lower(p.username)) > 0
    )
  -- Les matches "starts-with" remontent en premier (length du prefix non
  -- matché = 0 → tri ascendant naturel via position()).
  order by
    position(lower(p_query) in lower(p.username)) asc,
    length(p.username) asc,
    lower(p.username) asc
  limit p_limit;
$$;

grant execute on function public.search_users_by_username(text, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Recommandations : top users par nombre d'abonnés. Inclut les comptes déjà
-- suivis — la row affichera "Suivi" plutôt que "Suivre" côté UI, mais on
-- veut bien voir les profils familiers dans la liste de découverte (ils sont
-- typiquement les plus pertinents). Stable (tri secondaire alphabétique sur
-- username) pour que les résultats ne shufflent pas entre rendus.
-- ---------------------------------------------------------------------------
create or replace function public.recommend_users(
  p_limit int default 20
)
returns table (
  id                  uuid,
  username            text,
  display_name        text,
  avatar_url          text,
  is_premium          boolean,
  appearance          jsonb,
  badge_keys          text[],
  follower_count      integer,
  public_sheets_count integer
)
language sql
security definer
set search_path = public
stable
as $$
  with me as (select auth.uid() as uid),
  follower_counts as (
    select followed_id, count(*)::int as cnt
    from public.social_follows
    group by followed_id
  )
  select
    p.id,
    p.username,
    p.display_name,
    p.avatar_url,
    coalesce(p.is_premium, false),
    jsonb_strip_nulls(jsonb_build_object(
      'fontId',         p.preferences->'fontId',
      'colorPrimary',   p.preferences->'colorPrimary',
      'colorSecondary', p.preferences->'colorSecondary',
      'colorBg',        p.preferences->'colorBg',
      'borderId',       p.preferences->'borderId',
      'fondId',         p.preferences->'fondId',
      'fondOpacity',    p.preferences->'fondOpacity',
      'avatarFrameId',  p.preferences->'avatarFrameId'
    )),
    coalesce(
      (
        select array_agg(badge_key order by earned_at desc)
        from public.user_badges
        where user_id = p.id
      ),
      array[]::text[]
    ),
    coalesce(fc.cnt, 0),
    (
      select count(*)::int
      from public.reading_sheets rs
      join public.user_books    ub on ub.id = rs.user_book_id
      where ub.user_id = p.id and rs.is_public = true
    )
  from public.profiles p
  left join follower_counts fc on fc.followed_id = p.id
  where p.username is not null
    and p.id <> (select uid from me)
  order by coalesce(fc.cnt, 0) desc, lower(p.username) asc
  limit p_limit;
$$;

grant execute on function public.recommend_users(int) to authenticated;
