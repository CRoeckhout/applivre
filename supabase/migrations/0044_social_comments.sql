-- @grimolia/social — 0003 comments
-- Commentaires polymorphes. Threading limité à 1 niveau de réponse (parent_id
-- doit être un commentaire root, jamais un sous-commentaire) — contrainte
-- soft, vérifiée côté API. Soft-delete par défaut pour préserver les threads.

create table if not exists public.social_comments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  target_kind text not null,
  target_id   uuid not null,
  parent_id   uuid references public.social_comments(id) on delete cascade,
  body        text not null check (length(body) between 1 and 5000),
  edited_at   timestamptz,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now()
);

-- Liste chronologique des commentaires d'un objet.
create index if not exists social_comments_target_idx
  on public.social_comments (target_kind, target_id, created_at desc);

-- Lookup des réponses d'un parent.
create index if not exists social_comments_parent_idx
  on public.social_comments (parent_id)
  where parent_id is not null;

-- Profil "mes commentaires".
create index if not exists social_comments_user_idx
  on public.social_comments (user_id, created_at desc);

alter table public.social_comments enable row level security;

-- Lecture publique : tout commentaire non hard-delete est visible.
-- Le filtre "deleted_at is null" est appliqué côté API selon le contexte
-- (afficher [supprimé] si une réponse existe, masquer sinon).
create policy "social_comments_select_all"
  on public.social_comments
  for select
  using (true);

create policy "social_comments_insert_self"
  on public.social_comments
  for insert
  with check (auth.uid() = user_id);

-- Update limité à l'auteur, et seuls body/edited_at/deleted_at peuvent bouger.
-- La granularité fine sur les colonnes est gérée par l'API ; RLS vérifie juste
-- l'identité.
create policy "social_comments_update_self"
  on public.social_comments
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Hard-delete réservé à l'auteur (rare ; soft-delete privilégié dans l'API).
create policy "social_comments_delete_self"
  on public.social_comments
  for delete
  using (auth.uid() = user_id);

-- Granularité colonne : on ne peut éditer QUE body / edited_at / deleted_at.
-- Empêche un user de réécrire user_id, target_*, created_at, parent_id en
-- douce (RLS protège la ligne, ce GRANT protège les colonnes).
revoke update on public.social_comments from authenticated;
grant update (body, edited_at, deleted_at) on public.social_comments to authenticated;
