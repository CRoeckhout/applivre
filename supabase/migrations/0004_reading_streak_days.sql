-- 0004 — Défi de lecture quotidien : jours où l'utilisateur a lu ≥ 10 min.
-- PK composite (user_id, day) : au plus une entrée par jour par personne.

create table if not exists public.reading_streak_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.reading_streak_days enable row level security;

create policy "streak_days self" on public.reading_streak_days
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
