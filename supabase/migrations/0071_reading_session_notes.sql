-- 0071 — Notes libres sur les sessions de lecture.
--
-- 1 note par session (1:1) — l'utilisateur saisit un texte pendant ou après
-- la session pour capter ses pensées / passages marqués / questions. Affichée
-- dans la liste des sessions du livre et dans l'éditeur de fiche (panel
-- "Notes de sessions" agrégé par user_book).
--
-- Implémenté comme un simple champ nullable plutôt qu'une table 1:N pour
-- garder la plomberie minimale — l'user édite la note existante s'il veut
-- ajouter quelque chose plus tard.

alter table public.reading_sessions
  add column if not exists note text;

-- Check soft sur la longueur — laisse de la place pour des réflexions
-- longues sans encourager des dumps. Null reste valide (= pas de note).
alter table public.reading_sessions
  drop constraint if exists reading_sessions_note_length;
alter table public.reading_sessions
  add constraint reading_sessions_note_length
  check (note is null or char_length(note) <= 5000);
