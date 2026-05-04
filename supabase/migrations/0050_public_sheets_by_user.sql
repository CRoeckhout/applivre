-- 0050 — Liste des fiches publiques d'un utilisateur, pour la page profil.
--
-- Même shape de retour que list_public_sheets_for_book (cf. 0049) pour
-- partager le composant PublicSheetListItem côté mobile. SECURITY DEFINER,
-- n'expose QUE les colonnes publiques de reading_sheets + le snapshot
-- d'apparence + l'identité du livre.
--
-- owner_id est redondant dans le contexte (== p_user_id) mais retourné
-- pour uniformiser la signature avec 0049 — le composant consommateur
-- accède à row.owner_id sans avoir à propager userId séparément.

create or replace function public.list_public_sheets_by_user(p_user_id uuid)
returns table (
  sheet_id      uuid,
  owner_id      uuid,
  updated_at    timestamptz,
  book_isbn     text,
  book_title    text,
  book_cover_url text,
  book_authors  text[],
  appearance    jsonb
)
language sql
security definer
set search_path = public
stable
as $$
  select
    rs.id        as sheet_id,
    ub.user_id   as owner_id,
    rs.updated_at,
    ub.book_isbn,
    b.title      as book_title,
    b.cover_url  as book_cover_url,
    b.authors    as book_authors,
    rs.content->'appearance' as appearance
  from public.reading_sheets rs
  join public.user_books     ub on ub.id = rs.user_book_id
  join public.books          b  on b.isbn = ub.book_isbn
  where ub.user_id = p_user_id
    and rs.is_public = true
  order by rs.updated_at desc;
$$;

grant execute on function public.list_public_sheets_by_user(uuid) to authenticated;
