-- 0067 — Gate `get_release_notes_since` par la version d'app installée.
--
-- Bug remonté : un user en v1.3 voyait la note v1.4 dès que l'admin avait
-- mis `published_at <= now()`, alors que la build v1.4 n'était pas encore
-- en ligne sur les stores. La RPC d'origine (0066) filtrait uniquement
-- sur `published_at` et `> p_last_seen`, sans plafond sur la version de
-- l'app courante du client. C'est fragile : ça repose sur l'admin pour
-- ajuster `published_at` exactement le jour de l'approbation store.
--
-- Fix : ajouter un paramètre `p_app_version` et filtrer
--   `version <= p_app_version`
-- via le helper `semver_to_int_array`. Comme ça l'app mobile ne voit
-- jamais de note pour une version qu'elle n'a pas effectivement installée
-- — même si l'admin a publié la note trop tôt côté DB.
--
-- Compat : `p_app_version` est `text default null`. Si null (anciens
-- clients qui n'envoient pas la version), on retombe sur le comportement
-- 0066 (pas de plafond) — pas de régression silencieuse.
--
-- Drop explicite de la signature 0066 (un seul param). Sans ça, Postgres
-- garde l'ancienne fonction en plus de la nouvelle et la résolution
-- devient ambiguë : `get_release_notes_since(null)` ne sait plus laquelle
-- appeler.
drop function if exists public.get_release_notes_since(text);

create or replace function public.get_release_notes_since(
  p_last_seen   text default null,
  p_app_version text default null
)
returns setof public.release_notes
language sql
stable
security definer
set search_path = public
as $$
  select *
    from public.release_notes
   where published_at <= now()
     and (
       p_last_seen is null
       or public.semver_to_int_array(version) > public.semver_to_int_array(p_last_seen)
     )
     and (
       p_app_version is null
       or public.semver_to_int_array(version) <= public.semver_to_int_array(p_app_version)
     )
   order by published_at desc, version desc;
$$;

grant execute on function public.get_release_notes_since(text, text) to authenticated;
