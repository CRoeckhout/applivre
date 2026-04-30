-- 0033 — Admin RLS sur bingo_pills
-- Permettre aux profils is_admin = true de SELECT/INSERT/UPDATE/DELETE
-- toutes les pills (cross-user). La policy "self" reste active : un user
-- non-admin garde l'accès uniquement à ses propres pills.

drop policy if exists "bingo_pills admin all" on public.bingo_pills;
create policy "bingo_pills admin all" on public.bingo_pills
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );
