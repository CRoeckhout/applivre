-- 0020 — Border catalog server-authoritative
-- Cadres 9-slice (PNG en MVP, SVG/Lottie plus tard) appliqués aux cards/fiches/bingos.
-- Pattern aligné sur badge_catalog : RLS lecture publique, écriture admin only.
-- PNG stocké dans bucket Storage `border-graphics` ; row réfère au path.

-- ═════════════ Catalog table ═════════════

create table if not exists public.border_catalog (
  border_key      text primary key,
  title           text not null,
  description     text,
  kind            text not null default 'png_9slice'
                    check (kind in ('png_9slice','svg_9slice','lottie_9slice')),
  -- PNG : storage path (bucket border-graphics). SVG/Lottie : inline payload.
  storage_path    text,
  payload         text,
  image_width     int not null,
  image_height    int not null,
  slice_top       int not null,
  slice_right     int not null,
  slice_bottom    int not null,
  slice_left      int not null,
  -- Distance depuis chaque bord externe vers l'intérieur où démarre le bg
  -- coloré rendu derrière le cadre. Permet d'aligner le bg sur la position
  -- réelle de l'encre du cadre (qui peut être au milieu de l'edge slice
  -- pour les bordures dessinées main). NULL = app utilise slice/2.
  bg_inset_top    int,
  bg_inset_right  int,
  bg_inset_bottom int,
  bg_inset_left   int,
  tokens          jsonb not null default '{}'::jsonb,
  -- Cadre disponible pour tous les users sans unlock préalable. Les cadres
  -- non-default sont verrouillés et n'apparaissent dans le catalog du user
  -- que s'il a une row dans `user_borders`. Plusieurs cadres peuvent être
  -- default simultanément (ex. cadres de base + cadres saisonniers ouverts
  -- temporairement à tous).
  is_default      boolean not null default false,
  active_from     timestamptz,
  active_until    timestamptz,
  retired_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users(id),
  -- Au moins une source : storage_path (PNG) ou payload (SVG/Lottie inline).
  constraint border_source_present check (
    storage_path is not null or payload is not null
  ),
  constraint border_slices_nonneg check (
    slice_top >= 0 and slice_right >= 0 and slice_bottom >= 0 and slice_left >= 0
  ),
  constraint border_slices_fit check (
    slice_left + slice_right <= image_width
    and slice_top + slice_bottom <= image_height
  )
);

create index if not exists border_catalog_active_idx
  on public.border_catalog (active_from, active_until)
  where retired_at is null;

create or replace function public._touch_border_catalog_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists border_catalog_touch on public.border_catalog;
create trigger border_catalog_touch
before update on public.border_catalog
for each row execute function public._touch_border_catalog_updated_at();

-- ═════════════ RLS ═════════════

alter table public.border_catalog enable row level security;

drop policy if exists "border_catalog read" on public.border_catalog;
create policy "border_catalog read" on public.border_catalog
  for select
  using (true);

drop policy if exists "border_catalog admin write" on public.border_catalog;
create policy "border_catalog admin write" on public.border_catalog
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

grant select on public.border_catalog to anon, authenticated;
grant insert, update, delete on public.border_catalog to authenticated;

-- ═════════════ Storage bucket ═════════════
-- Lecture publique (cadres affichés à tous). Écriture admin only.

insert into storage.buckets (id, name, public)
values ('border-graphics', 'border-graphics', true)
on conflict (id) do nothing;

drop policy if exists "border-graphics public read" on storage.objects;
create policy "border-graphics public read"
  on storage.objects for select
  using (bucket_id = 'border-graphics');

drop policy if exists "border-graphics admin insert" on storage.objects;
create policy "border-graphics admin insert"
  on storage.objects for insert
  with check (
    bucket_id = 'border-graphics'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

drop policy if exists "border-graphics admin update" on storage.objects;
create policy "border-graphics admin update"
  on storage.objects for update
  using (
    bucket_id = 'border-graphics'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

drop policy if exists "border-graphics admin delete" on storage.objects;
create policy "border-graphics admin delete"
  on storage.objects for delete
  using (
    bucket_id = 'border-graphics'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );
