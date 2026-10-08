-- 0079 — (1) Édition de ses propres soumissions de livres tant qu'elles sont
-- `pending` (section « Livres que j'ai soumis » du profil). (2) Archivage
-- admin d'une soumission pending → rejetée (cf. bas du fichier).
--
-- Pas de policy UPDATE : on passe par une RPC qui ne touche que les champs
-- de contenu. `book_isbn` (clé biblio) et `isbn` restent figés, le statut
-- et les champs de décision sont réservés à `decide_book_submission`.
-- Le `for update` sérialise avec une décision admin concurrente : une fois
-- décidée, la soumission n'est plus modifiable.

create or replace function public.update_own_book_submission(
  p_submission_id uuid,
  p_title text,
  p_pages integer,
  p_authors text[],
  p_categories text[],
  p_published_at text,
  p_cover_url text
)
returns public.book_submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.book_submissions;
begin
  select * into v_row
    from public.book_submissions
   where id = p_submission_id
     and user_id = auth.uid()
   for update;

  if not found then
    raise exception 'submission not found' using errcode = 'P0002';
  end if;

  if v_row.status <> 'pending' then
    raise exception 'submission already decided' using errcode = '22023';
  end if;

  update public.book_submissions
     set title = trim(p_title),
         pages = p_pages,
         authors = coalesce(p_authors, '{}'),
         categories = coalesce(p_categories, '{}'),
         published_at = nullif(trim(coalesce(p_published_at, '')), ''),
         cover_url = nullif(trim(coalesce(p_cover_url, '')), '')
   where id = p_submission_id
   returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.update_own_book_submission(uuid, text, integer, text[], text[], text, text)
  to authenticated;

-- ═════════════ Archivage d'une soumission encore pending ═════════════
-- Remplace la version 0078 : une `pending` supprimée par l'admin sans
-- décision passe directement en `rejected` (sans motif) avant d'être
-- archivée, pour que l'user voie un statut définitif dans son profil.

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

  update public.book_submissions
     set status = case when status = 'pending' then 'rejected' else status end,
         decided_at = case when status = 'pending' then now() else decided_at end,
         decided_by = case when status = 'pending' then auth.uid() else decided_by end,
         archived_at = coalesce(archived_at, now()),
         archived_by = coalesce(archived_by, auth.uid())
   where id = p_submission_id
   returning * into v_row;

  return v_row;
end;
$$;
