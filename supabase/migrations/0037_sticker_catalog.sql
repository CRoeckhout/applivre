-- 0037 — Sticker catalog server-authoritative
-- Stickers (PNG ou SVG) placés librement par l'utilisateur sur une fiche de
-- lecture (et plus tard les bingos). Pattern aligné sur fond_catalog : RLS
-- lecture publique, écriture admin only. Diffère des fonds : pas de fill mode
-- (chaque sticker est posé à un x/y/scale/rotation arbitraire par le user),
-- pas de slice. Les SVG conservent les `tokens` pour permettre un recolor
-- runtime via le système de sentinelles partagé (cf. lib/decorations/tokens).

-- ═════════════ Catalog table ═════════════

create table if not exists public.sticker_catalog (
  sticker_key   text primary key,
  title         text not null,
  description   text,
  kind          text not null default 'png'
                  check (kind in ('png','svg')),
  storage_path  text,
  payload       text,
  -- Dimensions natives de la source. Sert au rendu (aspect ratio) et au
  -- calcul de la taille naturelle d'un placement (= fraction de la largeur
  -- de la fiche, ratio préservé via image_width/height).
  image_width   int not null,
  image_height  int not null,
  tokens        jsonb not null default '{}'::jsonb,
  is_default    boolean not null default false,
  active_from   timestamptz,
  active_until  timestamptz,
  retired_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id),
  constraint sticker_source_present check (
    storage_path is not null or payload is not null
  ),
  constraint sticker_dims_positive check (
    image_width > 0 and image_height > 0
  )
);

create index if not exists sticker_catalog_active_idx
  on public.sticker_catalog (active_from, active_until)
  where retired_at is null;

create or replace function public._touch_sticker_catalog_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists sticker_catalog_touch on public.sticker_catalog;
create trigger sticker_catalog_touch
before update on public.sticker_catalog
for each row execute function public._touch_sticker_catalog_updated_at();

-- ═════════════ RLS ═════════════

alter table public.sticker_catalog enable row level security;

drop policy if exists "sticker_catalog read" on public.sticker_catalog;
create policy "sticker_catalog read" on public.sticker_catalog
  for select
  using (true);

drop policy if exists "sticker_catalog admin write" on public.sticker_catalog;
create policy "sticker_catalog admin write" on public.sticker_catalog
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

grant select on public.sticker_catalog to anon, authenticated;
grant insert, update, delete on public.sticker_catalog to authenticated;

-- ═════════════ Storage bucket ═════════════

insert into storage.buckets (id, name, public)
values ('sticker-graphics', 'sticker-graphics', true)
on conflict (id) do nothing;

drop policy if exists "sticker-graphics public read" on storage.objects;
create policy "sticker-graphics public read"
  on storage.objects for select
  using (bucket_id = 'sticker-graphics');

drop policy if exists "sticker-graphics admin insert" on storage.objects;
create policy "sticker-graphics admin insert"
  on storage.objects for insert
  with check (
    bucket_id = 'sticker-graphics'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

drop policy if exists "sticker-graphics admin update" on storage.objects;
create policy "sticker-graphics admin update"
  on storage.objects for update
  using (
    bucket_id = 'sticker-graphics'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

drop policy if exists "sticker-graphics admin delete" on storage.objects;
create policy "sticker-graphics admin delete"
  on storage.objects for delete
  using (
    bucket_id = 'sticker-graphics'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );
