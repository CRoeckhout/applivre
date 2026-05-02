-- 0039 — Avatar frame catalog server-authoritative
-- Cadres ronds (PNG) appliqués autour de la photo de profil de l'utilisateur.
-- Pattern aligné sur fond_catalog : RLS lecture publique, écriture admin only.
-- Diffère de border_catalog (cadres autour des cards/fiches) : forme toujours
-- ronde (border-radius full côté app), pas de 9-slice, et deux paramètres
-- d'ajustement propres au cadre (image_scale + image_padding) qui contrôlent
-- la taille rendue de la photo à l'intérieur du cadre.

-- ═════════════ Catalog table ═════════════

create table if not exists public.avatar_frame_catalog (
  frame_key      text primary key,
  title          text not null,
  description    text,
  -- MVP : PNG uniquement. Le check est laissé extensible pour pouvoir ajouter
  -- 'svg' plus tard sans migration de schéma.
  kind           text not null default 'png'
                   check (kind in ('png')),
  storage_path   text,
  payload        text,
  image_width    int not null,
  image_height   int not null,
  -- Taille de la photo de profil exprimée en fraction de la dimension
  -- extérieure du cadre (1.0 = la photo couvre tout le container, 0.7 =
  -- 70% du diamètre du cadre). Permet à l'admin de compenser l'épaisseur
  -- visuelle du PNG (cadres ornés, anneaux épais, etc.) pour que la photo
  -- s'aligne sur le cercle intérieur du cadre.
  image_scale    numeric(4,3) not null default 0.800
                   check (image_scale > 0 and image_scale <= 1),
  -- Padding additionnel autour de la photo, exprimé en pixels dans l'espace
  -- natif du PNG (image_width × image_height). Appliqué APRÈS image_scale et
  -- mis à l'échelle au rendu en fonction de la taille effective du cadre.
  -- Sert au fine-tuning (cadres asymétriques ou ajustement pixel-perfect).
  image_padding  int not null default 0
                   check (image_padding >= 0),
  tokens         jsonb not null default '{}'::jsonb,
  is_default     boolean not null default false,
  active_from    timestamptz,
  active_until   timestamptz,
  retired_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users(id),
  constraint avatar_frame_source_present check (
    storage_path is not null or payload is not null
  ),
  constraint avatar_frame_dims_positive check (
    image_width > 0 and image_height > 0
  )
);

create index if not exists avatar_frame_catalog_active_idx
  on public.avatar_frame_catalog (active_from, active_until)
  where retired_at is null;

create or replace function public._touch_avatar_frame_catalog_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists avatar_frame_catalog_touch on public.avatar_frame_catalog;
create trigger avatar_frame_catalog_touch
before update on public.avatar_frame_catalog
for each row execute function public._touch_avatar_frame_catalog_updated_at();

-- ═════════════ RLS ═════════════

alter table public.avatar_frame_catalog enable row level security;

drop policy if exists "avatar_frame_catalog read" on public.avatar_frame_catalog;
create policy "avatar_frame_catalog read" on public.avatar_frame_catalog
  for select
  using (true);

drop policy if exists "avatar_frame_catalog admin write" on public.avatar_frame_catalog;
create policy "avatar_frame_catalog admin write" on public.avatar_frame_catalog
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

grant select on public.avatar_frame_catalog to anon, authenticated;
grant insert, update, delete on public.avatar_frame_catalog to authenticated;

-- ═════════════ Storage bucket ═════════════

insert into storage.buckets (id, name, public)
values ('avatar-frame-graphics', 'avatar-frame-graphics', true)
on conflict (id) do nothing;

drop policy if exists "avatar-frame-graphics public read" on storage.objects;
create policy "avatar-frame-graphics public read"
  on storage.objects for select
  using (bucket_id = 'avatar-frame-graphics');

drop policy if exists "avatar-frame-graphics admin insert" on storage.objects;
create policy "avatar-frame-graphics admin insert"
  on storage.objects for insert
  with check (
    bucket_id = 'avatar-frame-graphics'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

drop policy if exists "avatar-frame-graphics admin update" on storage.objects;
create policy "avatar-frame-graphics admin update"
  on storage.objects for update
  using (
    bucket_id = 'avatar-frame-graphics'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

drop policy if exists "avatar-frame-graphics admin delete" on storage.objects;
create policy "avatar-frame-graphics admin delete"
  on storage.objects for delete
  using (
    bucket_id = 'avatar-frame-graphics'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );
