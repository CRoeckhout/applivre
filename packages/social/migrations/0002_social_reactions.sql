-- @grimolia/social — 0002 reactions
-- Réactions polymorphes : un user pose une réaction de type donné sur un objet
-- identifié par (target_kind, target_id). Le package ne connaît pas la nature
-- des objets — c'est l'app hôte qui mappe les kinds (book / sheet / bingo / review…).
--
-- Multi-réactions autorisées : un user peut "like" ET "laugh" la même cible.
-- Set initial : like, love, laugh. Étendu via ALTER TABLE…CHECK plus tard si besoin.

create table if not exists public.social_reactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  target_kind text not null,
  target_id   uuid not null,
  type        text not null check (type in ('like','love','laugh')),
  created_at  timestamptz not null default now(),
  unique (user_id, target_kind, target_id, type)
);

-- Hot path : "donne-moi toutes les réactions sur cette cible".
create index if not exists social_reactions_target_idx
  on public.social_reactions (target_kind, target_id);

-- Hot path inverse : "donne-moi toutes les réactions de ce user" (profil, feed).
create index if not exists social_reactions_user_idx
  on public.social_reactions (user_id, created_at desc);

alter table public.social_reactions enable row level security;

create policy "social_reactions_select_all"
  on public.social_reactions
  for select
  using (true);

create policy "social_reactions_insert_self"
  on public.social_reactions
  for insert
  with check (auth.uid() = user_id);

create policy "social_reactions_delete_self"
  on public.social_reactions
  for delete
  using (auth.uid() = user_id);
