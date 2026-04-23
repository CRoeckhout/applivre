-- 0009 — Genres multi-valeur (override user).
-- Un livre peut appartenir à plusieurs genres (Fantasy + Humour, Polar + Historique…).
-- On remplace la colonne mono-valeur `genre` introduite en 0008 par un tableau
-- `genres`. Backfill des valeurs existantes avant drop.

alter table public.user_books
  add column if not exists genres text[] not null default '{}';

-- Backfill : si genre était rempli, on le met seul dans genres.
update public.user_books
  set genres = array[genre]
  where genre is not null
    and genre <> ''
    and (genres is null or array_length(genres, 1) is null);

alter table public.user_books
  drop column if exists genre;
