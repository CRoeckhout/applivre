-- 0058 — Reading music
-- Bibliothèque de musiques d'ambiance jouées pendant les sessions de lecture.
-- Feature gatée premium : seuls les abonnés peuvent récupérer les pistes.
-- Les non-abonnés voient la liste des thèmes (paywall sur tap).
--
-- Schéma :
--   - music_themes        : catégories thématiques (Horreur, Fantasy, …)
--                           gérées depuis l'admin Vite
--   - music_theme_tracks  : pistes audio rattachées à un thème
--                           is_active permet de retirer une piste sans la
--                           supprimer (utile pour A/B et droits)
--
-- Storage :
--   - bucket privé `music-theme-tracks` : SELECT gaté par is_premium,
--     INSERT/UPDATE/DELETE réservé admin. Les clients premium signent leurs
--     URLs côté JS via createSignedUrl (TTL 24h, déclenché à la sélection
--     d'un thème pour cache offline via expo-file-system).
--
-- RPCs :
--   - list_music_themes()                    : visible par tous (pour le
--                                              sélecteur — l'app affiche le
--                                              paywall sur tap si non-premium)
--   - get_music_theme_tracks(p_theme_key)    : premium-only, raise 'PREMIUM_REQUIRED'
--                                              sinon retourne les pistes actives

-- ═════════════ Tables ═════════════

create table if not exists public.music_themes (
    id uuid primary key default gen_random_uuid (),
    key text unique not null check (key ~ '^[a-z0-9_-]+$'),
    display_name text not null,
    sort_order int not null default 0,
    is_active boolean not null default true,
    created_at timestamptz not null default now()
);

create index if not exists music_themes_active_sort_idx on public.music_themes (sort_order, display_name)
where
    is_active = true;

create table if not exists public.music_theme_tracks (
    id uuid primary key default gen_random_uuid (),
    theme_id uuid not null references public.music_themes (id) on delete cascade,
    title text not null,
    storage_path text not null,
    sort_order int not null default 0,
    is_active boolean not null default true,
    duration_ms int,
    created_at timestamptz not null default now()
);

create index if not exists music_theme_tracks_theme_idx on public.music_theme_tracks (theme_id, sort_order)
where
    is_active = true;

-- ═════════════ RLS ═════════════

alter table public.music_themes enable row level security;

alter table public.music_theme_tracks enable row level security;

-- Lecture : tous les authentifiés voient les thèmes actifs (le sélecteur s'affiche
-- aussi pour les non-premium ; le gating premium se fait sur les pistes via la RPC).
drop policy if exists "music_themes read active" on public.music_themes;

create policy "music_themes read active" on public.music_themes for
select using (is_active = true);

drop policy if exists "music_themes admin write" on public.music_themes;

create policy "music_themes admin write" on public.music_themes for all using (
    exists (
        select 1
        from public.profiles p
        where
            p.id = auth.uid ()
            and p.is_admin = true
    )
)
with
    check (
        exists (
            select 1
            from public.profiles p
            where
                p.id = auth.uid ()
                and p.is_admin = true
        )
    );

-- Lecture des pistes : restreinte aux admins via RLS directe. Les clients
-- premium passent par la RPC get_music_theme_tracks (security definer) qui
-- bypass cette restriction après avoir validé is_premium. Empêche un client
-- de lister la table directement.
drop policy if exists "music_theme_tracks admin read" on public.music_theme_tracks;

create policy "music_theme_tracks admin read" on public.music_theme_tracks for
select using (
        exists (
            select 1
            from public.profiles p
            where
                p.id = auth.uid ()
                and p.is_admin = true
        )
    );

drop policy if exists "music_theme_tracks admin write" on public.music_theme_tracks;

create policy "music_theme_tracks admin write" on public.music_theme_tracks for all using (
    exists (
        select 1
        from public.profiles p
        where
            p.id = auth.uid ()
            and p.is_admin = true
    )
)
with
    check (
        exists (
            select 1
            from public.profiles p
            where
                p.id = auth.uid ()
                and p.is_admin = true
        )
    );

grant select on public.music_themes to authenticated;

grant insert, update, delete on public.music_themes to authenticated;

grant
select, insert,
update, delete on public.music_theme_tracks to authenticated;

-- ═════════════ RPCs ═════════════

-- Liste des thèmes actifs. Accessible à tous les authentifiés (premium ou non) :
-- l'app affiche le sélecteur même aux non-abonnés, le paywall ne se déclenche
-- qu'au moment où ils tappent un thème.
create or replace function public.list_music_themes()
returns table (
  id           uuid,
  key          text,
  display_name text,
  sort_order   int
)
language sql
security definer
set search_path = public
stable
as $$
  select id, key, display_name, sort_order
  from public.music_themes
  where is_active = true
  order by sort_order asc, display_name asc;
$$;

grant
execute on function public.list_music_themes () to authenticated;

-- Pistes d'un thème, gatées premium. Retourne les storage_path (le client
-- signe les URLs via supabase.storage.createSignedUrl côté JS — ça reste
-- gardé par la policy SELECT du bucket music-theme-tracks).
--
-- Erreurs métier :
--   PREMIUM_REQUIRED → utilisateur non abonné
--   THEME_NOT_FOUND  → key inconnue ou thème désactivé
create or replace function public.get_music_theme_tracks(p_theme_key text)
returns table (
  id           uuid,
  title        text,
  storage_path text,
  duration_ms  int,
  sort_order   int
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_user_id    uuid := auth.uid();
  v_is_premium boolean;
  v_theme_id   uuid;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  select p.is_premium into v_is_premium
  from public.profiles p
  where p.id = v_user_id;

  if not coalesce(v_is_premium, false) then
    raise exception 'PREMIUM_REQUIRED' using errcode = 'P0001';
  end if;

  select t.id into v_theme_id
  from public.music_themes t
  where t.key = p_theme_key and t.is_active = true;

  if v_theme_id is null then
    raise exception 'THEME_NOT_FOUND' using errcode = 'P0002';
  end if;

  return query
  select
    tr.id,
    tr.title,
    tr.storage_path,
    tr.duration_ms,
    tr.sort_order
  from public.music_theme_tracks tr
  where tr.theme_id = v_theme_id
    and tr.is_active = true
  order by tr.sort_order asc, tr.title asc;
end;
$$;

grant
execute on function public.get_music_theme_tracks (text) to authenticated;

-- ═════════════ Storage bucket ═════════════
-- Bucket privé : SELECT gaté par is_premium (les non-abonnés ne peuvent pas
-- signer d'URL même s'ils devinent un storage_path). INSERT/UPDATE/DELETE
-- réservé admin via l'admin Vite.

insert into
    storage.buckets (id, name, public)
values (
        'music-theme-tracks',
        'music-theme-tracks',
        false
    )
on conflict (id) do nothing;

-- SELECT autorisé aux premium (app mobile) ET aux admins (admin Vite — pour
-- preview/écoute lors de l'upload, indépendamment de leur statut premium).
drop policy if exists "music-theme-tracks premium read" on storage.objects;

create policy "music-theme-tracks premium read" on storage.objects for
select using (
        bucket_id = 'music-theme-tracks'
        and exists (
            select 1
            from public.profiles p
            where
                p.id = auth.uid ()
                and (
                    coalesce(p.is_premium, false) = true
                    or p.is_admin = true
                )
        )
    );

drop policy if exists "music-theme-tracks admin insert" on storage.objects;

create policy "music-theme-tracks admin insert" on storage.objects for insert
with
    check (
        bucket_id = 'music-theme-tracks'
        and exists (
            select 1
            from public.profiles p
            where
                p.id = auth.uid ()
                and p.is_admin = true
        )
    );

drop policy if exists "music-theme-tracks admin update" on storage.objects;

create policy "music-theme-tracks admin update" on storage.objects
for update
    using (
        bucket_id = 'music-theme-tracks'
        and exists (
            select 1
            from public.profiles p
            where
                p.id = auth.uid ()
                and p.is_admin = true
        )
    );

drop policy if exists "music-theme-tracks admin delete" on storage.objects;

create policy "music-theme-tracks admin delete" on storage.objects for delete using (
    bucket_id = 'music-theme-tracks'
    and exists (
        select 1
        from public.profiles p
        where
            p.id = auth.uid ()
            and p.is_admin = true
    )
);