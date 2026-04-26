-- 0016 — Badges utilisateur
-- Table append-only : un badge gagné est conservé pour toujours.
-- `badge_key` est l'identifiant logique côté client (ex: 'first_sheet',
-- 'sheets_count:5'). Aucune table catalogue côté DB : la définition
-- (titre/desc/couleur) reste dans le code applicatif et peut évoluer
-- librement sans migration.

create table if not exists public.user_badges (
  user_id uuid not null references auth.users(id) on delete cascade,
  badge_key text not null,
  earned_at timestamptz not null default now(),
  primary key (user_id, badge_key)
);

create index if not exists user_badges_user_idx on public.user_badges (user_id);

alter table public.user_badges enable row level security;

drop policy if exists "user_badges self" on public.user_badges;
create policy "user_badges self" on public.user_badges
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
