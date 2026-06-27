-- 0076 — Compte total des publications d'un user (page profil).
--
-- Le carousel pagine par batch (get_user_feed), donc on ne peut pas dériver
-- le total du nombre chargé. Cette RPC renvoie le compte complet, avec la
-- MÊME règle de visibilité que get_user_feed (0075) :
--   - public    : compté pour tous
--   - followers : compté seulement si le caller suit l'user (ou est l'user)
--   - private   : compté seulement pour l'user lui-même
-- Pas de fenêtre temporelle, comme get_user_feed.

create or replace function public.get_user_feed_count(p_actor_id uuid)
returns integer
language sql
security definer
set search_path = public
stable
as $$
  with me as (select auth.uid() as uid),
  follows_actor as (
    select 1 from public.social_follows, me
    where follower_id = me.uid and followed_id = p_actor_id
  )
  select count(*)::int
  from public.social_feed_entries e
  where e.actor_id = p_actor_id
    and (
      e.actor_id = (select uid from me)
      or e.visibility = 'public'
      or (
        e.visibility = 'followers'
        and exists (select 1 from follows_actor)
      )
    );
$$;

grant execute on function public.get_user_feed_count(uuid) to authenticated;
