-- 0075 — Feed d'un utilisateur : ses publications, en chronologique.
--
-- Variante de get_feed (0051) filtrée sur un seul actor_id et SANS scoring :
-- on veut le mur de publications d'un user (fiches partagées, avis postés,
-- reposts) tel qu'affiché sur sa page profil, du plus récent au plus ancien.
-- Pagination par created_at exclusif (p_before).
--
-- Visibility répliquée explicitement (SECURITY DEFINER bypasse RLS), même
-- règle que get_feed mais relative au profil consulté :
--   - public    : tout le monde voit les publications publiques de l'user
--   - followers : seulement si le caller suit l'user (ou est l'user lui-même)
--   - private   : seulement l'user lui-même
--
-- La forme de sortie est ALIGNÉE sur get_feed (colonnes source + score
-- incluses) pour réutiliser mapRow côté client sans branche dédiée. `source`
-- est calculée relativement au caller ('self' s'il consulte son propre
-- profil, sinon 'followee'/'discovery') et `score` est neutre (0) — le tri
-- est purement chronologique ici.

create or replace function public.get_user_feed(
  p_actor_id uuid,
  p_limit int default 20,
  p_before timestamptz default null
)
returns table (
  entry_id           uuid,
  actor_id           uuid,
  actor_username     text,
  actor_display_name text,
  actor_avatar_url   text,
  actor_is_premium   boolean,
  actor_appearance   jsonb,
  actor_badge_keys   text[],
  verb               text,
  target_kind        text,
  target_id          uuid,
  meta               jsonb,
  created_at         timestamptz,
  source             text,
  score              double precision
)
language sql
security definer
set search_path = public
stable
as $$
  with me as (select auth.uid() as uid),
  follows_actor as (
    select 1 from public.social_follows, me
    where follower_id = me.uid and followed_id = p_actor_id
  ),
  base as (
    select
      e.id,
      e.actor_id,
      e.verb,
      e.target_kind,
      e.target_id,
      e.meta,
      e.created_at,
      case
        when e.actor_id = (select uid from me) then 'self'
        when exists (select 1 from follows_actor) then 'followee'
        else 'discovery'
      end as source
    from public.social_feed_entries e
    where e.actor_id = p_actor_id
      and (p_before is null or e.created_at < p_before)
      and (
        e.actor_id = (select uid from me)
        or e.visibility = 'public'
        or (
          e.visibility = 'followers'
          and exists (select 1 from follows_actor)
        )
      )
  )
  select
    b.id           as entry_id,
    b.actor_id,
    p.username     as actor_username,
    p.display_name as actor_display_name,
    p.avatar_url   as actor_avatar_url,
    coalesce(p.is_premium, false) as actor_is_premium,
    jsonb_strip_nulls(jsonb_build_object(
      'fontId',         p.preferences->'fontId',
      'colorPrimary',   p.preferences->'colorPrimary',
      'colorSecondary', p.preferences->'colorSecondary',
      'colorBg',        p.preferences->'colorBg',
      'borderId',       p.preferences->'borderId',
      'fondId',         p.preferences->'fondId',
      'fondOpacity',    p.preferences->'fondOpacity',
      'avatarFrameId',  p.preferences->'avatarFrameId'
    )) as actor_appearance,
    coalesce(
      (
        select array_agg(badge_key order by earned_at desc)
        from public.user_badges
        where user_id = b.actor_id
      ),
      array[]::text[]
    ) as actor_badge_keys,
    b.verb,
    b.target_kind,
    b.target_id,
    b.meta,
    b.created_at,
    b.source,
    0::double precision as score
  from base b
  left join public.profiles p on p.id = b.actor_id
  order by b.created_at desc, b.id desc
  limit p_limit;
$$;

grant execute on function public.get_user_feed(uuid, int, timestamptz) to authenticated;
