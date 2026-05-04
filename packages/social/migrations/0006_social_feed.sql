-- @grimolia/social — 0006 feed
-- Activity stream type ActivityPub : (actor, verb, object). Les "verbes"
-- forment un vocabulaire ouvert, propre à l'app hôte (Grimolia émet
-- 'finished_reading', 'posted_review', 'shared_sheet', 'won_bingo'… ; une
-- future app musique émettrait 'liked_album', 'finished_playlist'…).
--
-- Le feed est tiré (pull-based) à la lecture par une simple jointure
-- "entrées des users que je suis ∪ les miennes". Pas de fanout v1.
--
-- Visibility : 'public' visible par tous, 'followers' restreint aux abonnés
-- de l'actor, 'private' = aucun follower (utile pour archive perso). Les RLS
-- filtrent automatiquement, l'API n'a pas à le faire.

create table if not exists public.social_feed_entries (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid not null references auth.users(id) on delete cascade,
  verb         text not null,
  target_kind  text,
  target_id    uuid,
  meta         jsonb not null default '{}'::jsonb,
  visibility   text not null default 'public'
               check (visibility in ('public','followers','private')),
  created_at   timestamptz not null default now()
);

-- Hot path : feed d'un user (ses propres entrées dans son profil).
create index if not exists social_feed_entries_actor_idx
  on public.social_feed_entries (actor_id, created_at desc);

-- Hot path : timeline globale chronologique (admin / découverte).
create index if not exists social_feed_entries_created_idx
  on public.social_feed_entries (created_at desc);

-- Lookup "quelles entrées concernent cet objet" (ex: tous les events sur un livre).
create index if not exists social_feed_entries_target_idx
  on public.social_feed_entries (target_kind, target_id)
  where target_kind is not null;

alter table public.social_feed_entries enable row level security;

-- Lecture : visibility-aware.
create policy "social_feed_entries_select_visible"
  on public.social_feed_entries
  for select
  using (
    -- Mes propres entrées, toujours visibles.
    auth.uid() = actor_id
    or visibility = 'public'
    or (
      visibility = 'followers'
      and exists (
        select 1 from public.social_follows
        where follower_id = auth.uid() and followed_id = actor_id
      )
    )
  );

-- Création : un user ne peut publier que ses propres activités.
create policy "social_feed_entries_insert_self"
  on public.social_feed_entries
  for insert
  with check (auth.uid() = actor_id);

-- Suppression : seul l'actor peut retirer une entrée de son flux.
create policy "social_feed_entries_delete_self"
  on public.social_feed_entries
  for delete
  using (auth.uid() = actor_id);

-- Pas d'update : le flux est append-only ; corriger = supprimer + republier.
