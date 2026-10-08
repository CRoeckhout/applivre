-- 0078 — Suppression (soft) des soumissions de livres déjà traitées.
--
-- L'admin peut retirer de sa file une soumission `approved` / `rejected`.
-- La row reste en base (historique, audit) : on pose juste `archived_at`,
-- et le backoffice filtre `archived_at is null`. Les `pending` ne sont pas
-- archivables : elles doivent d'abord être décidées.

alter table public.book_submissions
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null;

create or replace function public.archive_book_submission(p_submission_id uuid)
returns public.book_submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.book_submissions;
begin
  if not public.is_caller_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_row
    from public.book_submissions
   where id = p_submission_id
   for update;

  if not found then
    raise exception 'submission not found' using errcode = 'P0002';
  end if;

  if v_row.status = 'pending' then
    raise exception 'submission still pending' using errcode = '22023';
  end if;

  update public.book_submissions
     set archived_at = coalesce(archived_at, now()),
         archived_by = coalesce(archived_by, auth.uid())
   where id = p_submission_id
   returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.archive_book_submission(uuid) to authenticated;
