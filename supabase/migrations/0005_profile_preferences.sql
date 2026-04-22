-- 0005 — Ajouter une colonne `preferences` JSONB sur profiles.
-- Extensible : on y mettra les réglages user (objectif lecture, thème, etc.).

alter table public.profiles
  add column if not exists preferences jsonb not null default '{}'::jsonb;
