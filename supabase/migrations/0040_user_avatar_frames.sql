-- 0040 — User avatar frames (unlock per-user)
-- Pattern identique à user_borders / user_fonds / user_stickers. Catalog
-- effectif d'un user pour les cadres photo = (avatar_frame_catalog where
-- is_default = true) UNION (rows liées dans user_avatar_frames).

create table if not exists public.user_avatar_frames (
  user_id     uuid not null references auth.users(id) on delete cascade,
  frame_key   text not null references public.avatar_frame_catalog(frame_key)
                on update cascade on delete restrict,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, frame_key)
);

create index if not exists user_avatar_frames_user_idx
  on public.user_avatar_frames (user_id);

-- ═════════════ RLS ═════════════

alter table public.user_avatar_frames enable row level security;

drop policy if exists "user_avatar_frames self read" on public.user_avatar_frames;
create policy "user_avatar_frames self read" on public.user_avatar_frames
  for select
  using (auth.uid() = user_id);

drop policy if exists "user_avatar_frames self insert" on public.user_avatar_frames;
create policy "user_avatar_frames self insert" on public.user_avatar_frames
  for insert
  with check (auth.uid() = user_id);

grant select, insert on public.user_avatar_frames to authenticated;
