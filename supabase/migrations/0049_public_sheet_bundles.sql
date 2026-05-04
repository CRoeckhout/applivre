-- 0049 — Bundles de lecture pour fiches publiques.
--
-- La RLS de reading_sheets autorise déjà la lecture des fiches is_public,
-- mais user_books reste self-only. Pour afficher la fiche d'un autre user
-- on a besoin d'accéder à (book_isbn, owner_id) qui vivent dans user_books.
-- On expose donc deux fonctions SECURITY DEFINER bundlant la donnée
-- nécessaire — figées sur les colonnes publiques uniquement (pas de status,
-- rating, finished_at, started_at, etc. qui sont privés au lecteur).

-- ---------------------------------------------------------------------------
-- Bundle d'une fiche publique par UUID — pour l'écran read-only
-- /sheet/view/[id].
-- ---------------------------------------------------------------------------
create or replace function public.get_public_sheet(p_sheet_id uuid)
returns table (
  sheet_id      uuid,
  user_book_id  uuid,
  content       jsonb,
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
    and rs.is_public = true;
$$;

grant execute on function public.get_public_sheet(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Liste des fiches publiques portant sur un ISBN donné — pour la section
-- découverte sur /book/[isbn].
-- ---------------------------------------------------------------------------
create or replace function public.list_public_sheets_for_book(p_isbn text)
returns table (
  sheet_id     uuid,
  owner_id     uuid,
  updated_at   timestamptz,
  -- Contenu allégé : juste de quoi générer un aperçu (titre + 1re ligne).
  -- Pas le content complet pour ne pas balayer tout en une requête.
  preview      text,
  section_count integer
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
    -- Concat des premiers titres comme aperçu, séparés par " · ".
    (
      select string_agg(s->>'title', ' · ' order by ord)
      from (
        select s, ord
        from jsonb_array_elements(rs.content->'sections') with ordinality as t(s, ord)
        limit 3
      ) sub
      where (s->>'title') is not null
    ) as preview,
    coalesce(jsonb_array_length(rs.content->'sections'), 0) as section_count
  from public.reading_sheets rs
  join public.user_books     ub on ub.id = rs.user_book_id
  where ub.book_isbn = p_isbn
    and rs.is_public = true
  order by rs.updated_at desc;
$$;

grant execute on function public.list_public_sheets_for_book(text) to authenticated;
