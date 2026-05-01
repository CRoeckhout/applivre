-- 0036 — User fonds (unlock per-user)
-- Pattern identique à user_borders. Catalog effectif d'un user pour les
-- fonds = (fond_catalog where is_default = true) UNION (rows liées dans
-- user_fonds).

create table if not exists public.user_fonds (
  user_id     uuid not null references auth.users(id) on delete cascade,
  fond_key    text not null references public.fond_catalog(fond_key)
                on update cascade on delete restrict,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, fond_key)
);

create index if not exists user_fonds_user_idx
  on public.user_fonds (user_id);

-- ═════════════ RLS ═════════════

alter table public.user_fonds enable row level security;

drop policy if exists "user_fonds self read" on public.user_fonds;
create policy "user_fonds self read" on public.user_fonds
  for select
  using (auth.uid() = user_id);

drop policy if exists "user_fonds self insert" on public.user_fonds;
create policy "user_fonds self insert" on public.user_fonds
  for insert
  with check (auth.uid() = user_id);

grant select, insert on public.user_fonds to authenticated;
