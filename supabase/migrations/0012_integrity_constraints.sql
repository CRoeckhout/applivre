-- 0012 — Garde-fous serveur pour l'intégrité des données
-- Validations côté DB qui persistent même si le client est buggé ou
-- contourné. Le client UX reste responsable de l'expérience,
-- mais le serveur a le dernier mot sur la cohérence des données.

-- Helper d'idempotence : Postgres ne supporte pas
-- `ADD CONSTRAINT IF NOT EXISTS`. On test pg_constraint avant d'ajouter.

-- 1. Un seul cycle ouvert par livre (anti-doublon au race).
create unique index if not exists one_open_cycle_per_user_book
  on public.read_cycles (user_book_id)
  where finished_at is null;

-- 2. finished_at >= started_at sur cycles.
-- NOT VALID : rétroactivement tolère les lignes legacy qui violeraient
-- la contrainte. Toutes les nouvelles écritures seront validées.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'read_cycles_dates_ok'
      and conrelid = 'public.read_cycles'::regclass
  ) then
    alter table public.read_cycles
      add constraint read_cycles_dates_ok
      check (finished_at is null or finished_at >= started_at) not valid;
  end if;
end $$;

-- 3. outcome requis si et seulement si finished_at défini.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'read_cycles_outcome_when_finished'
      and conrelid = 'public.read_cycles'::regclass
  ) then
    alter table public.read_cycles
      add constraint read_cycles_outcome_when_finished
      check ((finished_at is null) = (outcome is null)) not valid;
  end if;
end $$;

-- 4. session.stopped_at_page <= book.pages (si pages connu).
create or replace function public.check_session_page()
returns trigger
language plpgsql
as $$
declare
  max_pages int;
begin
  select b.pages into max_pages
  from public.user_books ub
  join public.books b on b.isbn = ub.book_isbn
  where ub.id = new.user_book_id;
  if max_pages is not null and max_pages > 0 and new.stopped_at_page > max_pages then
    raise exception 'stopped_at_page (%) dépasse le total du livre (%)',
      new.stopped_at_page, max_pages
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists session_page_check on public.reading_sessions;
create trigger session_page_check
  before insert or update on public.reading_sessions
  for each row execute function public.check_session_page();

-- 5. session.cycle_id.user_book_id doit matcher session.user_book_id.
create or replace function public.check_session_cycle_match()
returns trigger
language plpgsql
as $$
declare
  cycle_book uuid;
begin
  if new.cycle_id is not null then
    select user_book_id into cycle_book
    from public.read_cycles where id = new.cycle_id;
    if cycle_book is distinct from new.user_book_id then
      raise exception 'session.user_book_id (%) incohérent avec cycle.user_book_id (%)',
        new.user_book_id, cycle_book
        using errcode = 'foreign_key_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists session_cycle_match on public.reading_sessions;
create trigger session_cycle_match
  before insert or update on public.reading_sessions
  for each row execute function public.check_session_cycle_match();

-- 6. user_books.finished_at >= started_at quand les deux sont définis.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'user_books_dates_ok'
      and conrelid = 'public.user_books'::regclass
  ) then
    alter table public.user_books
      add constraint user_books_dates_ok
      check (finished_at is null or started_at is null or finished_at >= started_at)
      not valid;
  end if;
end $$;

-- 7. book_loans.date_back >= date_out.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'loans_dates_ok'
      and conrelid = 'public.book_loans'::regclass
  ) then
    alter table public.book_loans
      add constraint loans_dates_ok
      check (date_back is null or date_back >= date_out) not valid;
  end if;
end $$;
