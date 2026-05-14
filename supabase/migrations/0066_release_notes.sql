-- 0066 — Release notes : "Dernières nouveautés" affichées aux users à la
-- montée de version de l'app.
--
-- Modèle : une entrée par `version` (texte SemVer style "1.2.0"), body en
-- JSONB (schéma de blocs typés : title/text/list/table/image — validé côté
-- client). Les images des blocs sont stockées dans un bucket public dédié
-- `release-notes-assets`.
--
-- Lecture (mobile) : RPC `get_release_notes_since(p_last_seen)` retourne,
-- triées de la plus récente à la plus ancienne, les notes publiées dont la
-- version est strictement supérieure à `p_last_seen` (NULL = renvoie tout).
-- Le store mobile mémorise `lastSeenVersion` dans AsyncStorage (Zustand
-- persist) et l'envoie ici.
--
-- Lecture/écriture (admin) : pas de RPC dédiée ; l'admin écrit en direct
-- via `.from('release_notes')`, ce qui matche la convention des autres
-- catalogs (badges, borders, etc.). La policy SELECT a une branche admin
-- qui voit aussi les notes `published_at > now()` (programmation à
-- l'avance), et la policy `for all` admin couvre INSERT/UPDATE/DELETE.
--
-- Plan du fichier :
--   1. Table `release_notes` + index
--   2. RLS : SELECT (users → publiées only, admins → tout) + policy admin
--      write (`for all`) + grants DML
--   3. Helper `semver_to_int_array` pour comparaison ordonnée des versions
--   4. RPC publique `get_release_notes_since(p_last_seen text)`
--   5. Bucket Storage `release-notes-assets` (public read, admin write)

-- ═══════════════ 1. Table ═══════════════

create table if not exists public.release_notes (
  id            uuid primary key default gen_random_uuid(),
  version       text not null unique,
  title         text not null,
  body          jsonb not null default '[]'::jsonb,
  published_at  timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index if not exists release_notes_published_at_idx
  on public.release_notes (published_at desc);

-- ═══════════════ 2. RLS + grants ═══════════════

alter table public.release_notes enable row level security;

-- SELECT : un user authentifié voit les notes publiées ; un admin voit
-- aussi les notes programmées (`published_at > now()`).
drop policy if exists "release_notes read" on public.release_notes;
create policy "release_notes read"
  on public.release_notes
  for select
  to authenticated
  using (
    published_at <= now()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

-- INSERT/UPDATE/DELETE : réservés aux admins. Pattern identique à
-- badge_catalog (0017) : policy `for all` qui check `profiles.is_admin`.
drop policy if exists "release_notes admin write" on public.release_notes;
create policy "release_notes admin write"
  on public.release_notes
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

grant insert, update, delete on public.release_notes to authenticated;

-- ═══════════════ 3. Helper de comparaison SemVer ═══════════════
-- Comparaison naïve `text` casse "1.10.0" vs "1.2.0" (lexico). On parse en
-- int[] : Postgres compare alors élément par élément. Un composant
-- manquant ou non numérique est traité comme 0 ("1.0" < "1.0.1" → ok).

create or replace function public.semver_to_int_array(p_version text)
returns int[]
language sql
immutable
as $$
  select array(
    select coalesce(nullif(regexp_replace(part, '[^0-9]', '', 'g'), '')::int, 0)
    from unnest(string_to_array(coalesce(p_version, '0'), '.')) with ordinality as t(part, idx)
    order by idx
  );
$$;

-- ═══════════════ 4. RPC lecture ═══════════════

create or replace function public.get_release_notes_since(p_last_seen text default null)
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
   order by published_at desc, version desc;
$$;

grant execute on function public.get_release_notes_since(text) to authenticated;

-- ═══════════════ 5. Bucket Storage `release-notes-assets` ═══════════════
-- Pattern aligné sur 0039 (avatar-frame-graphics) : public read, écriture
-- réservée aux admins (profiles.is_admin = true). Stocke les images/GIF
-- référencées par les blocs `image` du body JSONB.

insert into storage.buckets (id, name, public)
values ('release-notes-assets', 'release-notes-assets', true)
on conflict (id) do nothing;

drop policy if exists "release-notes-assets public read" on storage.objects;
create policy "release-notes-assets public read"
  on storage.objects for select
  using (bucket_id = 'release-notes-assets');

drop policy if exists "release-notes-assets admin insert" on storage.objects;
create policy "release-notes-assets admin insert"
  on storage.objects for insert
  with check (
    bucket_id = 'release-notes-assets'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

drop policy if exists "release-notes-assets admin update" on storage.objects;
create policy "release-notes-assets admin update"
  on storage.objects for update
  using (
    bucket_id = 'release-notes-assets'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

drop policy if exists "release-notes-assets admin delete" on storage.objects;
create policy "release-notes-assets admin delete"
  on storage.objects for delete
  using (
    bucket_id = 'release-notes-assets'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );
