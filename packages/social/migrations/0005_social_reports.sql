-- @grimolia/social — 0005 reports
-- Signalements polymorphes. target_kind couvre tout : 'user', 'message',
-- 'comment', 'review', 'photo', 'sheet'… L'app hôte décide quels kinds
-- acceptent un report, le package fournit juste le stockage.
--
-- Lecture : un user voit ses propres reports (suivi de modération) ; les
-- modérateurs accèdent via une vue ou via le service_role (hors scope).

create table if not exists public.social_reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null references auth.users(id) on delete cascade,
  target_kind  text not null,
  target_id    uuid not null,
  reason       text not null check (reason in (
    'spam',
    'harassment',
    'hate',
    'sexual',
    'illegal',
    'self_harm',
    'misinformation',
    'other'
  )),
  details      text check (length(details) <= 2000),
  status       text not null default 'pending'
               check (status in ('pending','reviewed','dismissed','actioned')),
  reviewed_by  uuid references auth.users(id) on delete set null,
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now(),
  -- Un user ne signale pas le même objet deux fois (anti-spam basique).
  unique (reporter_id, target_kind, target_id)
);

-- Hot path modération : queue par statut.
create index if not exists social_reports_status_idx
  on public.social_reports (status, created_at desc);

-- Hot path : "ce contenu a-t-il déjà été signalé ?".
create index if not exists social_reports_target_idx
  on public.social_reports (target_kind, target_id);

alter table public.social_reports enable row level security;

create policy "social_reports_select_self"
  on public.social_reports
  for select
  using (auth.uid() = reporter_id);

create policy "social_reports_insert_self"
  on public.social_reports
  for insert
  with check (auth.uid() = reporter_id);

-- Pas d'update ni de delete par les users : un signalement, une fois posé, est
-- géré par la modération. Si le user veut "annuler", il signale autre chose.
