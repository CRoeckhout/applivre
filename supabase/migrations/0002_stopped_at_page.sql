-- 0002 — Renommer reading_sessions.pages_read en stopped_at_page
-- Depuis la v1, le timer trace l'index de la page d'arrêt (absolu) plutôt
-- que le nombre de pages lues (relatif).

alter table public.reading_sessions
  rename column pages_read to stopped_at_page;
