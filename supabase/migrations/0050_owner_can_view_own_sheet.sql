-- 0050 — get_public_sheet : autoriser l'owner à voir sa propre fiche privée.
--
-- Contexte : l'écran /sheet/view/[id] est devenu le viewer canonique d'une
-- fiche, et toutes les redirections (page livre, liste des fiches) y mènent
-- maintenant — y compris pour le propriétaire lui-même. Il faut donc lever
-- la contrainte stricte `is_public = true` du fetcher quand l'appelant est
-- l'owner. La RLS de reading_sheets autorisait déjà ce cas via le path
-- direct, mais get_public_sheet est SECURITY DEFINER donc on doit le
-- gérer explicitement.
--
-- Ajoute aussi is_public au retour pour que l'owner voie un badge "Privée"
-- vs "Publique" selon l'état réel de sa fiche. Changement de signature →
-- drop + create plutôt que create or replace.

drop function if exists public.get_public_sheet(uuid);

create function public.get_public_sheet(p_sheet_id uuid)
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
