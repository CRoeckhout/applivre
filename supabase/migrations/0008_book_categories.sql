-- 0008 — Catégories de livre (auto) + genre personnel (override user).
-- `books.categories` : tableau issu des registres (Google Books notamment),
-- partagé entre tous les utilisateurs comme le reste des métadonnées livres.
-- `user_books.genre` : override par utilisateur, permet de choisir/corriger
-- le genre indépendamment de ce que l'API renvoie.

alter table public.books
  add column if not exists categories text[] not null default '{}';

alter table public.user_books
  add column if not exists genre text;
