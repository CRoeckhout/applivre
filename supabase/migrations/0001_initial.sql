-- Applivre — schéma initial
-- À appliquer via la CLI Supabase (`supabase db push`) ou copier-coller dans l'éditeur SQL.

create extension if not exists "uuid-ossp";

-- PROFILS (liés à auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- LIVRES (cache des métadonnées Open Library, partagé entre utilisateurs)
create table if not exists public.books (
  isbn text primary key,
  title text not null,
  authors text[] not null default '{}',
  pages integer,
  published_at text,
  cover_url text,
  cached_at timestamptz not null default now()
);

-- ÉTAGÈRE PERSONNELLE : lien utilisateur ↔ livre
create type public.reading_status as enum ('to_read', 'reading', 'read', 'abandoned');

create table if not exists public.user_books (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  book_isbn text not null references public.books(isbn) on delete cascade,
  status public.reading_status not null default 'to_read',
  rating smallint check (rating between 1 and 5),
  favorite boolean not null default false,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, book_isbn)
);
create index on public.user_books (user_id, status);

-- SESSIONS DE LECTURE CHRONOMÉTRÉES (différenciateur Bookly)
create table if not exists public.reading_sessions (
  id uuid primary key default uuid_generate_v4(),
  user_book_id uuid not null references public.user_books(id) on delete cascade,
  duration_sec integer not null check (duration_sec >= 0),
  pages_read integer not null default 0 check (pages_read >= 0),
  started_at timestamptz not null default now()
);
create index on public.reading_sessions (user_book_id, started_at desc);

-- PRÊTS / EMPRUNTS NOMMÉS (différenciateur)
create type public.loan_direction as enum ('lent', 'borrowed');

create table if not exists public.book_loans (
  id uuid primary key default uuid_generate_v4(),
  user_book_id uuid not null references public.user_books(id) on delete cascade,
  contact_name text not null,
  direction public.loan_direction not null,
  date_out date not null default current_date,
  date_back date,
  note text
);
create index on public.book_loans (user_book_id);

-- FICHE DE LECTURE (catégories perso en JSON)
create table if not exists public.reading_sheets (
  id uuid primary key default uuid_generate_v4(),
  user_book_id uuid unique not null references public.user_books(id) on delete cascade,
  content jsonb not null default '{}'::jsonb,
  is_public boolean not null default false,
  updated_at timestamptz not null default now()
);

-- BINGOS PERSONNALISABLES (différenciateur)
create table if not exists public.bingos (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  grid jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.bingo_completions (
  id uuid primary key default uuid_generate_v4(),
  bingo_id uuid not null references public.bingos(id) on delete cascade,
  cell_index integer not null,
  user_book_id uuid references public.user_books(id) on delete set null,
  completed_at timestamptz not null default now(),
  unique (bingo_id, cell_index)
);

-- DÉFI ANNUEL
create table if not exists public.reading_challenges (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  year smallint not null,
  target_count integer not null check (target_count > 0),
  unique (user_id, year)
);

-- RLS : chaque utilisateur ne voit que ses données (sauf table books qui est publique)
alter table public.profiles enable row level security;
alter table public.user_books enable row level security;
alter table public.reading_sessions enable row level security;
alter table public.book_loans enable row level security;
alter table public.reading_sheets enable row level security;
alter table public.bingos enable row level security;
alter table public.bingo_completions enable row level security;
alter table public.reading_challenges enable row level security;

create policy "profiles self" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "user_books self" on public.user_books
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "reading_sessions via user_book" on public.reading_sessions
  for all using (
    exists (select 1 from public.user_books ub where ub.id = user_book_id and ub.user_id = auth.uid())
  );

create policy "book_loans via user_book" on public.book_loans
  for all using (
    exists (select 1 from public.user_books ub where ub.id = user_book_id and ub.user_id = auth.uid())
  );

create policy "reading_sheets private or owner" on public.reading_sheets
  for select using (
    is_public or exists (
      select 1 from public.user_books ub where ub.id = user_book_id and ub.user_id = auth.uid()
    )
  );
create policy "reading_sheets write owner" on public.reading_sheets
  for all using (
    exists (select 1 from public.user_books ub where ub.id = user_book_id and ub.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.user_books ub where ub.id = user_book_id and ub.user_id = auth.uid())
  );

create policy "bingos self" on public.bingos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "bingo_completions via bingo" on public.bingo_completions
  for all using (
    exists (select 1 from public.bingos b where b.id = bingo_id and b.user_id = auth.uid())
  );

create policy "challenges self" on public.reading_challenges
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
