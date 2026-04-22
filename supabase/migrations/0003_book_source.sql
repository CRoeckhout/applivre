-- 0003 — Ajouter la provenance d'un livre
-- Permet de distinguer les livres récupérés automatiquement (google/openlibrary)
-- des livres saisis manuellement par l'utilisateur.

alter table public.books
  add column if not exists source text;

-- Les livres existants n'ont pas de source connue → NULL est acceptable.
-- Les nouvelles insertions poseront 'openlibrary' / 'googlebooks' / 'manual'.
