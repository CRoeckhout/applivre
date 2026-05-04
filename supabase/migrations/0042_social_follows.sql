-- @grimolia/social — 0001 follows
-- Suivi asymétrique : A peut suivre B sans validation.
-- "Ami" = follow réciproque, dérivé au runtime, pas stocké.

create table if not exists public.social_follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  followed_id uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followed_id),
  check (follower_id <> followed_id)
);

-- Index pour lister rapidement les followers d'un user (la PK couvre déjà l'autre sens).
create index if not exists social_follows_followed_idx
  on public.social_follows (followed_id, created_at desc);

alter table public.social_follows enable row level security;

-- Lecture publique : qui suit qui est visible (cohérent avec un réseau public type Letterboxd).
-- À durcir si on introduit des comptes privés plus tard.
create policy "social_follows_select_all"
  on public.social_follows
  for select
  using (true);

-- Un user ne peut créer qu'un follow où il est le follower.
create policy "social_follows_insert_self"
  on public.social_follows
  for insert
  with check (auth.uid() = follower_id);

-- Un user ne peut supprimer que ses propres follows.
create policy "social_follows_delete_self"
  on public.social_follows
  for delete
  using (auth.uid() = follower_id);
