-- @grimolia/social — 0004 messaging (Realtime)
-- Messagerie 1-to-1, gate "première prise de contact" basé sur la policy du
-- destinataire. Le thread est l'unité de conversation entre deux users (pair
-- canonique). La 1re réponse du destinataire bascule automatiquement
-- pending → accepted. Le state 'blocked' est explicite (action utilisateur).
--
-- Les groupes (>2 users) ne sont PAS supportés v1 — modèle à étendre via une
-- table thread_participants si besoin futur.

-- ---------------------------------------------------------------------------
-- Préférences sociales par utilisateur
-- ---------------------------------------------------------------------------
-- Table propre au package (pas dans `profiles` qui appartient à l'app hôte).
-- Garde le package self-contained : une autre app peut adopter le schéma sans
-- toucher à son propre modèle profil.
create table if not exists public.social_user_settings (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  messaging_policy text not null default 'everyone'
                   check (messaging_policy in ('everyone','followers','mutuals','nobody')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.social_user_settings enable row level security;

-- Lecture publique : pour qu'un sender sache s'il a le droit d'initier.
create policy "social_user_settings_select_all"
  on public.social_user_settings
  for select using (true);

create policy "social_user_settings_upsert_self"
  on public.social_user_settings
  for insert with check (auth.uid() = user_id);

create policy "social_user_settings_update_self"
  on public.social_user_settings
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Fonction de gating : peut-on initier un message vers ce destinataire ?
-- ---------------------------------------------------------------------------
-- "followers" : le destinataire accepte les messages de ceux qui le suivent.
--               Convention Instagram-like : montrer de l'intérêt = droit de DM.
-- "mutuals"   : suivi réciproque requis.
-- "nobody"    : DM fermés.
create or replace function public.social_can_message(p_sender uuid, p_recipient uuid)
returns boolean
language sql
stable
as $$
  select case
    when p_sender = p_recipient then false
    else case coalesce(
      (select messaging_policy from public.social_user_settings where user_id = p_recipient),
      'everyone'
    )
      when 'nobody'    then false
      when 'everyone'  then true
      when 'followers' then exists (
        select 1 from public.social_follows
        where follower_id = p_sender and followed_id = p_recipient
      )
      when 'mutuals'   then
        exists (select 1 from public.social_follows
                where follower_id = p_sender and followed_id = p_recipient)
        and
        exists (select 1 from public.social_follows
                where follower_id = p_recipient and followed_id = p_sender)
      else true
    end
  end;
$$;

-- ---------------------------------------------------------------------------
-- Threads (paires canoniques)
-- ---------------------------------------------------------------------------
create table if not exists public.social_message_threads (
  id              uuid primary key default gen_random_uuid(),
  -- Pair canonique : user_a < user_b pour l'unicité d'une paire.
  user_a          uuid not null references auth.users(id) on delete cascade,
  user_b          uuid not null references auth.users(id) on delete cascade,
  initiator_id    uuid not null references auth.users(id) on delete cascade,
  state           text not null default 'pending'
                  check (state in ('pending','accepted','blocked')),
  blocked_by      uuid references auth.users(id) on delete set null,
  last_message_at timestamptz,
  created_at      timestamptz not null default now(),
  unique (user_a, user_b),
  check (user_a < user_b),
  check (initiator_id in (user_a, user_b)),
  check (blocked_by is null or blocked_by in (user_a, user_b))
);

create index if not exists social_message_threads_a_idx
  on public.social_message_threads (user_a, last_message_at desc nulls last);
create index if not exists social_message_threads_b_idx
  on public.social_message_threads (user_b, last_message_at desc nulls last);

alter table public.social_message_threads enable row level security;

create policy "social_message_threads_select_participant"
  on public.social_message_threads
  for select
  using (auth.uid() = user_a or auth.uid() = user_b);

-- Création : seul l'initiateur peut créer, et seulement si autorisé par la
-- policy du destinataire (via social_can_message).
create policy "social_message_threads_insert_authorized"
  on public.social_message_threads
  for insert
  with check (
    auth.uid() = initiator_id
    and (auth.uid() = user_a or auth.uid() = user_b)
    and public.social_can_message(
      auth.uid(),
      case when auth.uid() = user_a then user_b else user_a end
    )
  );

-- Update réservé aux participants (pour accepter / bloquer / débloquer).
-- La validation des transitions d'état se fait côté API.
create policy "social_message_threads_update_participant"
  on public.social_message_threads
  for update
  using (auth.uid() = user_a or auth.uid() = user_b)
  with check (auth.uid() = user_a or auth.uid() = user_b);

-- ---------------------------------------------------------------------------
-- Messages
-- ---------------------------------------------------------------------------
create table if not exists public.social_messages (
  id          uuid primary key default gen_random_uuid(),
  thread_id   uuid not null references public.social_message_threads(id) on delete cascade,
  sender_id   uuid not null references auth.users(id) on delete cascade,
  body        text not null check (length(body) between 1 and 4000),
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists social_messages_thread_idx
  on public.social_messages (thread_id, created_at desc);

alter table public.social_messages enable row level security;

create policy "social_messages_select_participant"
  on public.social_messages
  for select
  using (
    exists (
      select 1 from public.social_message_threads t
      where t.id = thread_id
        and (auth.uid() = t.user_a or auth.uid() = t.user_b)
    )
  );

-- Insert : participant du thread, thread non bloqué, envoyeur cohérent.
create policy "social_messages_insert_participant"
  on public.social_messages
  for insert
  with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.social_message_threads t
      where t.id = thread_id
        and t.state <> 'blocked'
        and (auth.uid() = t.user_a or auth.uid() = t.user_b)
    )
  );

-- Update : seulement marquer comme lu (read_at) — réservé au destinataire.
-- Le grant colonne ci-dessous fige l'immutabilité du body : un destinataire
-- ne peut PAS réécrire le message du sender, même via SQL direct.
create policy "social_messages_update_recipient"
  on public.social_messages
  for update
  using (
    auth.uid() <> sender_id
    and exists (
      select 1 from public.social_message_threads t
      where t.id = thread_id
        and (auth.uid() = t.user_a or auth.uid() = t.user_b)
    )
  )
  with check (
    auth.uid() <> sender_id
  );

-- Messages = quasi-immutables. Seul read_at peut bouger (et seulement par le
-- destinataire grâce à la policy ci-dessus).
revoke update on public.social_messages from authenticated;
grant update (read_at) on public.social_messages to authenticated;

-- ---------------------------------------------------------------------------
-- Trigger : maintien de last_message_at + auto-acceptation à la 1re réponse
-- ---------------------------------------------------------------------------
create or replace function public.social_messages_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.social_message_threads
  set last_message_at = new.created_at,
      state = case
        when state = 'pending' and new.sender_id <> initiator_id then 'accepted'
        else state
      end
  where id = new.thread_id;
  return new;
end;
$$;

drop trigger if exists trg_social_messages_after_insert on public.social_messages;
create trigger trg_social_messages_after_insert
  after insert on public.social_messages
  for each row
  execute function public.social_messages_after_insert();
