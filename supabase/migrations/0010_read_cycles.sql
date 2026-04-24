-- 0010 — Cycles de lecture (relectures)
-- Chaque session de lecture appartient à un cycle. Fermer un cycle
-- (outcome: read/abandoned) isole les stats de la lecture suivante
-- sans perdre l'historique.

create type public.read_cycle_outcome as enum ('read', 'abandoned');

create table if not exists public.read_cycles (
  id uuid primary key default uuid_generate_v4(),
  user_book_id uuid not null references public.user_books(id) on delete cascade,
  index integer not null check (index > 0),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  final_page integer check (final_page >= 0),
  outcome public.read_cycle_outcome,
  unique (user_book_id, index)
);
create index on public.read_cycles (user_book_id, index);

alter table public.reading_sessions
  add column if not exists cycle_id uuid references public.read_cycles(id) on delete cascade;

create index if not exists reading_sessions_cycle_id_idx
  on public.reading_sessions (cycle_id);

alter table public.read_cycles enable row level security;

create policy "read_cycles via user_book" on public.read_cycles
  for all using (
    exists (
      select 1 from public.user_books ub
      where ub.id = user_book_id and ub.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.user_books ub
      where ub.id = user_book_id and ub.user_id = auth.uid()
    )
  );
