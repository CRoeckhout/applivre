-- 0052 — Listing enrichi des commentaires + récupération d'une feed entry.
--
-- 3 fonctions SECURITY DEFINER :
--   - list_root_comments(kind, id) : commentaires racines (parent_id IS NULL)
--   - list_replies(parent_id)      : réponses d'un root
--   - get_feed_entry(id)           : 1 feed entry enrichie (actor profile)
--
-- Chaque commentaire est renvoyé avec :
--   - actor (whitelist alignée sur get_public_profiles, cf. 0048)
--   - replies_count : nb de réponses (non-deleted) sous ce commentaire
--   - like_count    : nb de réactions sur ce commentaire (toutes types)
--   - my_like       : true si l'auth.uid() courant a posé une réaction
--   - is_editable   : true si non-deleted, auteur = me, ET 0 reply ET 0 reaction
--                     (verrou d'édition : un commentaire qui a "voyagé" devient
--                     immuable côté UX, pour ne pas réécrire un message déjà lu).
--
-- Un commentaire deleted_at non null reste visible si replies_count > 0
-- (placeholder "[supprimé]" côté UI) — sinon le client le filtre.

create or replace function public.list_root_comments(
  p_target_kind text,
  p_target_id   uuid
)
returns table (
  id                 uuid,
  user_id            uuid,
  body               text,
  created_at         timestamptz,
  edited_at          timestamptz,
  deleted_at         timestamptz,
  actor_username     text,
  actor_display_name text,
  actor_avatar_url   text,
  actor_is_premium   boolean,
  actor_appearance   jsonb,
  actor_badge_keys   text[],
  replies_count      integer,
  like_count         integer,
  my_like            boolean,
  is_editable        boolean
)
language sql
security definer
set search_path = public
stable
as $$
  with me as (select auth.uid() as uid)
  select
    c.id,
    c.user_id,
    c.body,
    c.created_at,
    c.edited_at,
    c.deleted_at,
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
        where user_id = c.user_id
      ),
      array[]::text[]
    ),
    (
      select count(*)::int
      from public.social_comments rc
      where rc.parent_id = c.id and rc.deleted_at is null
    ) as replies_count,
    (
      select count(*)::int
      from public.social_reactions r
      where r.target_kind = 'comment' and r.target_id = c.id
    ) as like_count,
    exists (
      select 1
      from public.social_reactions r, me
      where r.target_kind = 'comment'
        and r.target_id   = c.id
        and r.user_id     = me.uid
    ) as my_like,
    -- Editable si auteur courant ET non-deleted ET aucune reply ET aucune réaction.
    (
      c.user_id = (select uid from me)
      and c.deleted_at is null
      and not exists (
        select 1 from public.social_comments rc
        where rc.parent_id = c.id and rc.deleted_at is null
      )
      and not exists (
        select 1 from public.social_reactions r
        where r.target_kind = 'comment' and r.target_id = c.id
      )
    ) as is_editable
  from public.social_comments c
  left join public.profiles p on p.id = c.user_id
  where c.target_kind = p_target_kind
    and c.target_id   = p_target_id
    and c.parent_id is null
  order by c.created_at asc;
$$;

grant execute on function public.list_root_comments(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Réponses d'un commentaire root. Threading limité à 1 niveau (cf. 0044) :
-- on n'attend QUE des réponses directes au root_id passé.
-- ---------------------------------------------------------------------------
create or replace function public.list_comment_replies(
  p_parent_id uuid
)
returns table (
  id                 uuid,
  user_id            uuid,
  parent_id          uuid,
  body               text,
  created_at         timestamptz,
  edited_at          timestamptz,
  deleted_at         timestamptz,
  actor_username     text,
  actor_display_name text,
  actor_avatar_url   text,
  actor_is_premium   boolean,
  actor_appearance   jsonb,
  actor_badge_keys   text[],
  like_count         integer,
  my_like            boolean,
  is_editable        boolean
)
language sql
security definer
set search_path = public
stable
as $$
  with me as (select auth.uid() as uid)
  select
    c.id,
    c.user_id,
    c.parent_id,
    c.body,
    c.created_at,
    c.edited_at,
    c.deleted_at,
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
        where user_id = c.user_id
      ),
      array[]::text[]
    ),
    (
      select count(*)::int
      from public.social_reactions r
      where r.target_kind = 'comment' and r.target_id = c.id
    ) as like_count,
    exists (
      select 1
      from public.social_reactions r, me
      where r.target_kind = 'comment'
        and r.target_id   = c.id
        and r.user_id     = me.uid
    ) as my_like,
    (
      c.user_id = (select uid from me)
      and c.deleted_at is null
      and not exists (
        select 1 from public.social_reactions r
        where r.target_kind = 'comment' and r.target_id = c.id
      )
    ) as is_editable
  from public.social_comments c
  left join public.profiles p on p.id = c.user_id
  where c.parent_id = p_parent_id
  order by c.created_at asc;
$$;

grant execute on function public.list_comment_replies(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Lookup d'une feed entry par id. Pour l'écran dédié /feed/[entryId] qui
-- affiche un item + son thread complet. Réplique la logique visibility de
-- get_feed (cf. 0051) puisqu'on est en SECURITY DEFINER.
-- ---------------------------------------------------------------------------
create or replace function public.get_feed_entry(p_entry_id uuid)
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
  created_at         timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  with me as (select auth.uid() as uid)
  select
    e.id,
    e.actor_id,
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
        where user_id = e.actor_id
      ),
      array[]::text[]
    ),
    e.verb,
    e.target_kind,
    e.target_id,
    e.meta,
    e.created_at
  from public.social_feed_entries e
  left join public.profiles p on p.id = e.actor_id
  where e.id = p_entry_id
    and (
      e.actor_id = (select uid from me)
      or e.visibility = 'public'
      or (
        e.visibility = 'followers'
        and exists (
          select 1 from public.social_follows
          where follower_id = (select uid from me)
            and followed_id = e.actor_id
        )
      )
    );
$$;

grant execute on function public.get_feed_entry(uuid) to authenticated;
