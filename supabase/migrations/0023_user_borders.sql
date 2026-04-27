-- 0023 — Borders unlock table (user_borders)
-- Pattern aligné sur user_badges : le user accumule des cadres débloqués au
-- fil de son usage. Le catalog effectif d'un user = (border_catalog where
-- is_default = true) UNION (rows liées dans user_borders).

create table if not exists public.user_borders (
  user_id     uuid not null references auth.users(id) on delete cascade,
  border_key  text not null references public.border_catalog(border_key)
                on update cascade on delete restrict,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, border_key)
);

create index if not exists user_borders_user_idx
  on public.user_borders (user_id);

-- ═════════════ RLS ═════════════

alter table public.user_borders enable row level security;

drop policy if exists "user_borders self read" on public.user_borders;
create policy "user_borders self read" on public.user_borders
  for select
  using (auth.uid() = user_id);

drop policy if exists "user_borders self insert" on public.user_borders;
create policy "user_borders self insert" on public.user_borders
  for insert
  with check (auth.uid() = user_id);

-- Pas de update / delete user-level : un cadre débloqué est définitif côté
-- user. Les admins peuvent agir hors RLS via service_role si nécessaire.

grant select, insert on public.user_borders to authenticated;
