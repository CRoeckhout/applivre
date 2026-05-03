-- 0041 — Premium / availability model
-- (1) Remplace is_default boolean par enum `availability` (4 modes) sur les 4
--     catalogues perso (border, fond, sticker, avatar_frame). Sémantique :
--       everyone : visible et utilisable par tous (= ancien is_default = true)
--       premium  : visible mais locked si user non-premium ; cliquer = paywall
--       badge    : caché tant que la row n'est pas dans user_<asset> (= ancien
--                  is_default = false). `unlock_badge_key` formalise le badge
--                  qui débloque (wiring app→user_<asset> à faire séparément).
--       unit     : achat à l'unité — détail à définir, traité comme `badge`
--                  côté app en attendant la mécanique d'unlock.
-- (2) profiles.is_premium / premium_until : source de vérité serveur de
--     l'état d'abonnement, alimentée par webhook RevenueCat (phase 3).
-- (3) freemium_settings : singleton row pilotée depuis l'admin pour les
--     limites du plan freemium (max fiches, max bingos en cours).

-- ═════════════ Catalog availability enum ═════════════

do $$
begin
  if not exists (select 1 from pg_type where typname = 'catalog_availability') then
    create type public.catalog_availability as enum ('everyone', 'premium', 'badge', 'unit');
  end if;
end;
$$;

-- ═════════════ Patch des 4 catalogues ═════════════

-- border_catalog
alter table public.border_catalog
  add column if not exists availability public.catalog_availability not null default 'badge',
  add column if not exists unlock_badge_key text references public.badge_catalog(badge_key)
    on update cascade on delete set null;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'border_catalog' and column_name = 'is_default'
  ) then
    update public.border_catalog set availability = 'everyone' where is_default = true;
    alter table public.border_catalog drop column is_default;
  end if;
end;
$$;

-- fond_catalog
alter table public.fond_catalog
  add column if not exists availability public.catalog_availability not null default 'badge',
  add column if not exists unlock_badge_key text references public.badge_catalog(badge_key)
    on update cascade on delete set null;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'fond_catalog' and column_name = 'is_default'
  ) then
    update public.fond_catalog set availability = 'everyone' where is_default = true;
    alter table public.fond_catalog drop column is_default;
  end if;
end;
$$;

-- sticker_catalog
alter table public.sticker_catalog
  add column if not exists availability public.catalog_availability not null default 'badge',
  add column if not exists unlock_badge_key text references public.badge_catalog(badge_key)
    on update cascade on delete set null;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'sticker_catalog' and column_name = 'is_default'
  ) then
    update public.sticker_catalog set availability = 'everyone' where is_default = true;
    alter table public.sticker_catalog drop column is_default;
  end if;
end;
$$;

-- avatar_frame_catalog
alter table public.avatar_frame_catalog
  add column if not exists availability public.catalog_availability not null default 'badge',
  add column if not exists unlock_badge_key text references public.badge_catalog(badge_key)
    on update cascade on delete set null;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'avatar_frame_catalog' and column_name = 'is_default'
  ) then
    update public.avatar_frame_catalog set availability = 'everyone' where is_default = true;
    alter table public.avatar_frame_catalog drop column is_default;
  end if;
end;
$$;

-- Index pour les queries "items premium" côté app (filtre availability).
create index if not exists border_catalog_availability_idx
  on public.border_catalog (availability) where retired_at is null;
create index if not exists fond_catalog_availability_idx
  on public.fond_catalog (availability) where retired_at is null;
create index if not exists sticker_catalog_availability_idx
  on public.sticker_catalog (availability) where retired_at is null;
create index if not exists avatar_frame_catalog_availability_idx
  on public.avatar_frame_catalog (availability) where retired_at is null;

-- ═════════════ profiles : flag premium ═════════════
-- `is_premium` = état effectif courant. Mis à jour par webhook RevenueCat
-- (phase 3) via service_role ; les users ne l'écrivent jamais.
-- `premium_until` = expiration de l'abonnement actif. Permet d'afficher un
-- compte à rebours et de gérer un grace period serveur si besoin.

alter table public.profiles
  add column if not exists is_premium boolean not null default false,
  add column if not exists premium_until timestamptz;

create index if not exists profiles_is_premium_idx
  on public.profiles (is_premium) where is_premium = true;

-- ═════════════ Freemium settings (singleton) ═════════════

create table if not exists public.freemium_settings (
  id                int primary key default 1 check (id = 1),
  max_sheets        int not null default 25 check (max_sheets > 0),
  max_active_bingos int not null default 1  check (max_active_bingos > 0),
  updated_at        timestamptz not null default now(),
  updated_by        uuid references auth.users(id)
);

insert into public.freemium_settings (id) values (1) on conflict (id) do nothing;

create or replace function public._touch_freemium_settings_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists freemium_settings_touch on public.freemium_settings;
create trigger freemium_settings_touch
before update on public.freemium_settings
for each row execute function public._touch_freemium_settings_updated_at();

-- RLS : lecture publique (l'app a besoin des limites pour gater l'UI),
-- écriture admin only.

alter table public.freemium_settings enable row level security;

drop policy if exists "freemium_settings read" on public.freemium_settings;
create policy "freemium_settings read" on public.freemium_settings
  for select
  using (true);

drop policy if exists "freemium_settings admin write" on public.freemium_settings;
create policy "freemium_settings admin write" on public.freemium_settings
  for all
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

grant select on public.freemium_settings to anon, authenticated;
grant insert, update on public.freemium_settings to authenticated;
