-- 0057 — Messaging : RPCs + bascule policy par défaut sur 'mutuals'.
--
-- Construit la couche applicative au-dessus du schéma posé en 0045 :
--   - list_my_threads()        : threads + dernier message + unread + autre profil
--   - ensure_thread(other)     : canonicalise la paire (least, greatest), crée si absent
--   - mark_thread_read(thread) : passe read_at = now() sur les messages du destinataire
--
-- Bascule par défaut de la policy : v1 force 'mutuals' (chat réservé aux follows
-- réciproques). On migre aussi les rows existantes en 'everyone' (défaut historique)
-- vers 'mutuals' — un user qui voulait explicitement 'followers'/'nobody' garde son
-- choix. Le réglage UI est masqué v1, mais la table reste paramétrable.
--
-- Realtime : on ajoute les deux tables à la publication supabase_realtime pour
-- que le client puisse subscribe aux INSERT (nouveau message + nouveau thread).

-- ---------------------------------------------------------------------------
-- Bascule policy par défaut → mutuals
-- ---------------------------------------------------------------------------
alter table public.social_user_settings
  alter column messaging_policy set default 'mutuals';

update public.social_user_settings
  set messaging_policy = 'mutuals'
  where messaging_policy = 'everyone';

-- ---------------------------------------------------------------------------
-- list_my_threads : inbox enrichie de l'utilisateur courant
-- ---------------------------------------------------------------------------
-- Renvoie un thread par row, trié par dernier message décroissant (les threads
-- vides — pending sans 1er message — sont exclus, on n'a rien à afficher).
-- Le profil "other" est enrichi avec la même whitelist que ailleurs (cf. 0048).
create or replace function public.list_my_threads()
returns table (
  thread_id           uuid,
  state               text,
  initiator_id        uuid,
  last_message_at     timestamptz,
  last_message_id     uuid,
  last_message_body   text,
  last_message_sender uuid,
  unread_count        integer,
  other_user_id       uuid,
  other_username      text,
  other_display_name  text,
  other_avatar_url    text,
  other_is_premium    boolean,
  other_appearance    jsonb,
  other_badge_keys    text[]
)
language sql
security definer
set search_path = public
stable
as $$
  with me as (select auth.uid() as uid),
  my_threads as (
    select t.*,
           case when t.user_a = (select uid from me) then t.user_b else t.user_a end as other_id
    from public.social_message_threads t
    where (select uid from me) in (t.user_a, t.user_b)
      and t.last_message_at is not null
  ),
  last_msg as (
    select distinct on (m.thread_id)
      m.thread_id, m.id, m.body, m.sender_id, m.created_at
    from public.social_messages m
    where m.thread_id in (select id from my_threads)
    order by m.thread_id, m.created_at desc
  ),
  unread as (
    select m.thread_id, count(*)::int as cnt
    from public.social_messages m, me
    where m.thread_id in (select id from my_threads)
      and m.sender_id <> me.uid
      and m.read_at is null
    group by m.thread_id
  )
  select
    t.id,
    t.state,
    t.initiator_id,
    t.last_message_at,
    lm.id,
    lm.body,
    lm.sender_id,
    coalesce(u.cnt, 0),
    t.other_id,
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
        where user_id = t.other_id
      ),
      array[]::text[]
    )
  from my_threads t
  left join last_msg lm on lm.thread_id = t.id
  left join unread   u  on u.thread_id  = t.id
  left join public.profiles p on p.id = t.other_id
  order by t.last_message_at desc nulls last;
$$;

grant execute on function public.list_my_threads() to authenticated;

-- ---------------------------------------------------------------------------
-- ensure_thread : canonicalise (least, greatest) et upsert
-- ---------------------------------------------------------------------------
-- Renvoie le thread_id, qu'il existe déjà ou non. Vérifie social_can_message
-- avant d'insérer — si la policy du destinataire bloque, on lève. Si un thread
-- existe déjà (même bloqué), on le rend tel quel : seul l'écran appelant
-- décide quoi en faire (afficher l'historique, masquer le composer, etc.).
create or replace function public.ensure_thread(p_other uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_a  uuid;
  v_b  uuid;
  v_id uuid;
begin
  if v_me is null then
    raise exception 'auth required';
  end if;
  if p_other is null or p_other = v_me then
    raise exception 'invalid recipient';
  end if;

  v_a := least(v_me, p_other);
  v_b := greatest(v_me, p_other);

  select id into v_id
  from public.social_message_threads
  where user_a = v_a and user_b = v_b;

  if v_id is not null then
    return v_id;
  end if;

  if not public.social_can_message(v_me, p_other) then
    raise exception 'messaging not allowed';
  end if;

  insert into public.social_message_threads (user_a, user_b, initiator_id)
  values (v_a, v_b, v_me)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.ensure_thread(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- mark_thread_read : batch update read_at sur les messages reçus non-lus
-- ---------------------------------------------------------------------------
-- Bypass la RLS update colonne (grant only on read_at) puisqu'on est SECURITY
-- DEFINER, mais on contrôle explicitement que l'appelant est participant.
create or replace function public.mark_thread_read(p_thread uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_ok boolean;
begin
  if v_me is null then
    raise exception 'auth required';
  end if;

  select true into v_ok
  from public.social_message_threads
  where id = p_thread
    and v_me in (user_a, user_b);
  if not v_ok then
    raise exception 'thread not found';
  end if;

  update public.social_messages
     set read_at = now()
   where thread_id = p_thread
     and sender_id <> v_me
     and read_at is null;
end;
$$;

grant execute on function public.mark_thread_read(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime : ajouter les tables à la publication
-- ---------------------------------------------------------------------------
-- L'inbox subscribe aux UPDATE de threads (last_message_at bouge) et aux
-- INSERT (nouveau thread). Le thread ouvert subscribe aux INSERT de messages.
-- Idempotent : on no-op si déjà ajoutées.
do $$
begin
  begin
    alter publication supabase_realtime add table public.social_message_threads;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.social_messages;
  exception when duplicate_object then null;
  end;
end $$;
