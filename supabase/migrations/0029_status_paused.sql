-- Statut "En pause" : un livre en lecture peut être suspendu sans clôturer le cycle.
-- L'utilisateur saisit la page atteinte et un récap libre via la modale.
--
-- ALTER TYPE ADD VALUE doit être exécuté hors transaction qui réutilise la
-- valeur ; les ADD COLUMN ci-dessous ne référencent pas l'enum, donc safe.

alter type public.reading_status add value if not exists 'paused';

alter table public.user_books
  add column if not exists paused_page integer,
  add column if not exists paused_summary text;

alter table public.user_books
  add constraint user_books_paused_page_nonneg
  check (paused_page is null or paused_page >= 0)
  not valid;

alter table public.user_books validate constraint user_books_paused_page_nonneg;
