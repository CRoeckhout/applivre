-- ═══════════════════════════════════════════════════════════════════════════
-- 0074 — Ajustement du feed organique : decay + fenêtre temporelle
-- ═══════════════════════════════════════════════════════════════════════════
-- Le réseau est encore jeune : peu de contenu, donc on veut que les items
-- restent visibles longtemps.
--
--   1. Decay : demi-vie portée de 48 h à 120 h (5 jours). Le score décroît
--      donc beaucoup plus lentement.
--   2. Fenêtre : la coupure dure « created_at > now() - interval '30 days' »
--      est RETIRÉE pour l'instant. On garde la ligne en commentaire : il
--      suffira de la décommenter quand le réseau sera plus actif.
--
-- On redéfinit get_feed à l'identique de sa dernière version (0065), seules
-- ces deux lignes changent.

create or replace function public.get_feed(
  p_limit int default 30,
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
  followees as (
    select followed_id from public.social_follows, me
    where follower_id = me.uid
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
        when e.actor_id in (select followed_id from followees) then 'followee'
        else 'discovery'
      end as source
    from public.social_feed_entries e
    -- Fenêtre temporelle désactivée tant que le réseau est jeune.
    -- Réactiver en décommentant la ligne ci-dessous :
    -- where e.created_at > now() - interval '30 days' and
    where (p_before is null or e.created_at < p_before)
      and e.removed_at is null
      and not public.is_user_banned(e.actor_id)
      and (
        e.actor_id = (select uid from me)
        or e.visibility = 'public'
        or (
          e.visibility = 'followers'
          and e.actor_id in (select followed_id from followees)
        )
      )
  ),
  scored as (
    select
      b.*,
      power(0.5, extract(epoch from (now() - b.created_at)) / 3600.0 / 120.0)
      *
      case b.source
        when 'self'     then 1.5
        when 'followee' then 1.0
        else                 0.4
      end as score
    from base b
  )
  select
    s.id           as entry_id,
    s.actor_id,
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
        where user_id = s.actor_id
      ),
      array[]::text[]
    ) as actor_badge_keys,
    s.verb,
    s.target_kind,
    s.target_id,
    s.meta,
    s.created_at,
    s.source,
    s.score
  from scored s
  left join public.profiles p on p.id = s.actor_id
  order by s.score desc, s.created_at desc, s.id desc
  limit p_limit;
$$;
