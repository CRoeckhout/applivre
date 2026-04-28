-- 0025 — RLS table books
-- Registre public des métadonnées livres (cache Open Library / Google Books).
-- Lecture ouverte à tous (anon + authenticated).
-- Insert / update accessibles à tout utilisateur authentifié (flux scan ISBN
-- alimente le cache pour l'ensemble des utilisateurs).
-- Delete réservé aux admins (profiles.is_admin = true). Le service_role
-- contourne RLS si besoin de purge automatique.

alter table public.books enable row level security;

drop policy if exists "books read public" on public.books;
create policy "books read public" on public.books
  for select
  using (true);

drop policy if exists "books insert authenticated" on public.books;
create policy "books insert authenticated" on public.books
  for insert
  to authenticated
  with check (true);

drop policy if exists "books update authenticated" on public.books;
create policy "books update authenticated" on public.books
  for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "books admin delete" on public.books;
create policy "books admin delete" on public.books
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

grant select on public.books to anon, authenticated;
grant insert, update, delete on public.books to authenticated;
