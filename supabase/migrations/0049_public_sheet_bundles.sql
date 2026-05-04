-- 0049 — Bundles de lecture pour fiches partagées.
--
-- /sheet/view/[id] est devenu le viewer canonique d'une fiche, y compris
-- pour le propriétaire. La RLS de reading_sheets autorise déjà la lecture
-- des fiches is_public ET la lecture par leur owner ; mais la jointure
-- vers user_books (qui donne book_isbn et owner_id) est gated self-only
-- côté user_books. On expose donc deux fonctions SECURITY DEFINER qui
-- bundlent (sheet + book + author_id) en figeant les colonnes publiques.

-- ---------------------------------------------------------------------------
-- Bundle d'une fiche par UUID — pour /sheet/view/[id].
--
-- Visible si :
--   - rs.is_public = true (n'importe quel authentifié peut voir une fiche
--     publiée), OU
--   - ub.user_id = auth.uid() (l'owner accède à ses propres fiches privées
--     via la même route que les fiches publiques).
-- ---------------------------------------------------------------------------
create or replace function public.get_public_sheet(p_sheet_id uuid)
returns table (
  sheet_id      uuid,
  user_book_id  uuid,
  content       jsonb,
  is_public     boolean,
  updated_at    timestamptz,
  owner_id      uuid,
  book_isbn     text,
  book_title    text,
  book_authors  text[],
  book_cover_url text,
  book_pages    integer
)
language sql
security definer
set search_path = public
stable
as $$
  select
    rs.id          as sheet_id,
    rs.user_book_id,
    rs.content,
    rs.is_public,
    rs.updated_at,
    ub.user_id     as owner_id,
    ub.book_isbn,
    b.title        as book_title,
    b.authors      as book_authors,
    b.cover_url    as book_cover_url,
    b.pages        as book_pages
  from public.reading_sheets rs
  join public.user_books     ub on ub.id = rs.user_book_id
  join public.books          b  on b.isbn = ub.book_isbn
  where rs.id = p_sheet_id
    and (rs.is_public = true or ub.user_id = auth.uid());
$$;

grant execute on function public.get_public_sheet(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Liste des fiches publiques pour un ISBN — section découverte sur
-- /book/[isbn]. Renvoie l'apparence snapshotée + les colonnes book_*
-- nécessaires pour rendre une SheetCard compacte (cf. consumer
-- app/sheet/by-book/[isbn].tsx). PAS de content.sections — la liste est
-- visuelle uniquement, la consultation détaillée passe par get_public_sheet.
-- ---------------------------------------------------------------------------
create or replace function public.list_public_sheets_for_book(p_isbn text)
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
  where ub.book_isbn = p_isbn
    and rs.is_public = true
  order by rs.updated_at desc;
$$;

grant execute on function public.list_public_sheets_for_book(text) to authenticated;
