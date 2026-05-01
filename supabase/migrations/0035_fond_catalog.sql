-- 0035 — Fond catalog server-authoritative
-- Fonds (PNG/SVG plein cadre) appliqués aux cards/fiches/bingos en arrière-plan
-- du contenu. Pattern aligné sur border_catalog : RLS lecture publique,
-- écriture admin only. Diffère des cadres : pas de 9-slice (la source est
-- rendue cover OU tile sur toute la surface visible).

-- ═════════════ Catalog table ═════════════

create table if not exists public.fond_catalog (
  fond_key      text primary key,
  title         text not null,
  description   text,
  kind          text not null default 'png_9slice'
                  check (kind in ('png_9slice','svg_9slice','lottie_9slice')),
  -- Le suffixe `_9slice` du kind est conservé pour rester cohérent avec
  -- border_catalog (factorisation côté admin). Pour les fonds, slice n'est
  -- pas pertinent — l'image est rendue cover ou tile.
  storage_path  text,
  payload       text,
  image_width   int not null,
  image_height  int not null,
  -- Mode de remplissage : `cover` étire l'image en couvrant toute la surface
  -- (crop center si AR différent). `tile` répète le motif en tile entier.
  repeat_mode   text not null default 'cover'
                  check (repeat_mode in ('cover','tile')),
  tokens        jsonb not null default '{}'::jsonb,
  is_default    boolean not null default false,
  active_from   timestamptz,
  active_until  timestamptz,
  retired_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id),
  constraint fond_source_present check (
    storage_path is not null or payload is not null
  ),
  constraint fond_dims_positive check (
    image_width > 0 and image_height > 0
  )
);

create index if not exists fond_catalog_active_idx
  on public.fond_catalog (active_from, active_until)
  where retired_at is null;

create or replace function public._touch_fond_catalog_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists fond_catalog_touch on public.fond_catalog;
create trigger fond_catalog_touch
before update on public.fond_catalog
for each row execute function public._touch_fond_catalog_updated_at();

-- ═════════════ RLS ═════════════

alter table public.fond_catalog enable row level security;

drop policy if exists "fond_catalog read" on public.fond_catalog;
create policy "fond_catalog read" on public.fond_catalog
  for select
  using (true);

drop policy if exists "fond_catalog admin write" on public.fond_catalog;
create policy "fond_catalog admin write" on public.fond_catalog
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

grant select on public.fond_catalog to anon, authenticated;
grant insert, update, delete on public.fond_catalog to authenticated;

-- ═════════════ Storage bucket ═════════════

insert into storage.buckets (id, name, public)
values ('fond-graphics', 'fond-graphics', true)
on conflict (id) do nothing;

drop policy if exists "fond-graphics public read" on storage.objects;
create policy "fond-graphics public read"
  on storage.objects for select
  using (bucket_id = 'fond-graphics');

drop policy if exists "fond-graphics admin insert" on storage.objects;
create policy "fond-graphics admin insert"
  on storage.objects for insert
  with check (
    bucket_id = 'fond-graphics'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

drop policy if exists "fond-graphics admin update" on storage.objects;
create policy "fond-graphics admin update"
  on storage.objects for update
  using (
    bucket_id = 'fond-graphics'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

drop policy if exists "fond-graphics admin delete" on storage.objects;
create policy "fond-graphics admin delete"
  on storage.objects for delete
  using (
    bucket_id = 'fond-graphics'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );
