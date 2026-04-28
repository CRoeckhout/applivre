-- 0026 — Marqueur de nettoyage IA des métadonnées livre
-- Posé par l'edge function `extract-book-metadata` après extraction Groq
-- validée et appliquée. Permet de skip les livres déjà nettoyés (admin batch
-- + futur flow scan automatique).

alter table public.books
  add column if not exists ai_cleaned_at timestamptz;
