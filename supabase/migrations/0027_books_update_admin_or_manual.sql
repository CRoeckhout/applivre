-- 0027 — Restreindre UPDATE books aux admins, sauf livres source='manual'
-- Avant : tout authenticated pouvait update n'importe quel livre.
-- Après : seul admin peut update, exception pour livres saisis manuellement
-- (source = 'manual') qui restent éditables par tout authenticated.

drop policy if exists "books update authenticated" on public.books;

drop policy if exists "books update admin or manual" on public.books;
create policy "books update admin or manual" on public.books
  for update
  to authenticated
  using (
    source = 'manual'
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  )
  with check (
    source = 'manual'
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );
