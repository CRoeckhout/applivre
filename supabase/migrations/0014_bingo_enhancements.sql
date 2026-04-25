-- Bingo enhancements
-- - archived_at sur bingos (null = actif, set = archivé après victoire/abandon)
-- - bingo_pills : bibliothèque de pills custom réutilisables par l'utilisateur

alter table public.bingos
  add column if not exists archived_at timestamptz;

create index if not exists bingos_user_active_idx
  on public.bingos (user_id)
  where archived_at is null;

create table if not exists public.bingo_pills (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  created_at timestamptz not null default now(),
  unique (user_id, label)
);
create index if not exists bingo_pills_user_idx on public.bingo_pills (user_id);

alter table public.bingo_pills enable row level security;

create policy "bingo_pills self" on public.bingo_pills
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
