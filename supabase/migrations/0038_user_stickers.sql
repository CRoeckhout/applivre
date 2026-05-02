-- 0038 — User stickers (unlock per-user)
-- Pattern identique à user_borders / user_fonds. Catalog effectif d'un user
-- pour les stickers = (sticker_catalog where is_default = true) UNION (rows
-- liées dans user_stickers).

create table if not exists public.user_stickers (
  user_id     uuid not null references auth.users(id) on delete cascade,
  sticker_key text not null references public.sticker_catalog(sticker_key)
                on update cascade on delete restrict,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, sticker_key)
);

create index if not exists user_stickers_user_idx
  on public.user_stickers (user_id);

-- ═════════════ RLS ═════════════

alter table public.user_stickers enable row level security;

drop policy if exists "user_stickers self read" on public.user_stickers;
create policy "user_stickers self read" on public.user_stickers
  for select
  using (auth.uid() = user_id);

drop policy if exists "user_stickers self insert" on public.user_stickers;
create policy "user_stickers self insert" on public.user_stickers
  for insert
  with check (auth.uid() = user_id);

grant select, insert on public.user_stickers to authenticated;
