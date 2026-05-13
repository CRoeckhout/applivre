-- 0060 — Modération publique des défis bingo (`bingo_pills`).
--
-- Avant : pills 100 % privées (cf. 0014 + 0033). Chaque user crée ses
-- propres défis, aucun moyen d'enrichir le pool partagé.
--
-- Après : workflow user→admin :
--   - L'user soumet une pill à la modération via `propose_bingo_pill`.
--     status passe `private` → `proposed`, message attaché.
--   - L'admin tranche via `decide_bingo_pill` (gate is_caller_admin) :
--       approve → `public` (visible dans le picker des autres users)
--       reject  → `private` (la pill reste utilisable par son auteur,
--                 decision_reason stocke le pourquoi)
--       disable → `disabled` (soft-delete admin : retirée du picker du
--                 créateur ET des autres ; conservée pour audit)
--   - L'user voit en permanence le statut + decision_reason éventuel.
--
-- RLS :
--   - Ajout d'une policy publique `select` pour permettre aux autres users
--     de lire les pills `public` (alimente leur picker).
--   - La policy `bingo_pills self` (0014) est éclatée en 4 policies par
--     action. Le filtre « status <> 'public' » n'est PAS appliqué côté
--     policy : Postgres filtrerait alors les rows avant que le trigger
--     BEFORE ne s'exécute → DELETE/UPDATE = 0 rows silencieux (le client
--     ne saurait jamais que rien ne s'est passé).
--   - Garde-fou explicit : trigger BEFORE UPDATE/DELETE qui RAISE quand
--     OLD.status = 'public' et caller non-admin. L'erreur remonte via
--     supabase-js (statusCode 42501 → DbError côté mobile).
--   - La policy admin all (0033) reste inchangée — un admin peut toujours
--     forcer la suppression en cas exceptionnel.

-- ═════════════ Enum + colonnes ═════════════

do $$
begin
  if not exists (select 1 from pg_type where typname = 'bingo_pill_status') then
    create type public.bingo_pill_status as enum ('private', 'proposed', 'public', 'disabled');
  end if;
end $$;

alter table public.bingo_pills
  add column if not exists status public.bingo_pill_status not null default 'private',
  add column if not exists proposal_message text,
  add column if not exists decision_reason text,
  add column if not exists decided_at timestamptz,
  add column if not exists decided_by uuid references auth.users(id) on delete set null;

create index if not exists bingo_pills_status_idx
  on public.bingo_pills (status);

-- Index partiel hot-path : la queue de modération admin trie sur created_at
-- chez les pills `proposed` uniquement.
create index if not exists bingo_pills_status_proposed_idx
  on public.bingo_pills (created_at)
  where status = 'proposed';

-- ═════════════ RLS : lecture publique des pills approuvées ═════════════

drop policy if exists "bingo_pills public read" on public.bingo_pills;
create policy "bingo_pills public read" on public.bingo_pills
  for select to authenticated
  using (status = 'public');

-- ═════════════ RLS : self policies splittées ═════════════════════════
-- La policy `for all` (0014) ne permet pas de spécialiser une action ; on
-- la remplace par 4 policies par opération. Pas de filtre `status` côté
-- policy → le trigger garde-fou ci-dessous a la responsabilité de raise.

drop policy if exists "bingo_pills self" on public.bingo_pills;

create policy "bingo_pills self select" on public.bingo_pills
  for select to authenticated
  using (auth.uid() = user_id);

create policy "bingo_pills self insert" on public.bingo_pills
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy "bingo_pills self update" on public.bingo_pills
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "bingo_pills self delete" on public.bingo_pills
  for delete to authenticated
  using (auth.uid() = user_id);

-- ═════════════ Trigger garde-fou : raise visible ═════════════════════

create or replace function public.guard_bingo_pill_public_writes()
returns trigger
language plpgsql
as $$
begin
  -- Empêche un user de modifier/supprimer sa pill une fois publiée :
  -- d'autres users s'en servent dans leurs grilles (cf. policy public
  -- read). L'admin garde la possibilité via is_caller_admin (0059).
  --
  -- Les RPCs SECURITY DEFINER de cette migration passent toujours :
  -- `propose_bingo_pill` rejette les transitions hors private/proposed,
  -- `decide_bingo_pill` exige déjà is_caller_admin avant son UPDATE.
  if OLD.status = 'public' and not public.is_caller_admin() then
    raise exception 'Cannot % a published bingo pill', TG_OP
      using errcode = '42501';
  end if;
  return case when TG_OP = 'DELETE' then OLD else NEW end;
end;
$$;

drop trigger if exists guard_bingo_pill_public_writes on public.bingo_pills;
create trigger guard_bingo_pill_public_writes
  before update or delete on public.bingo_pills
  for each row
  execute function public.guard_bingo_pill_public_writes();

-- ═════════════ RPC propose_bingo_pill ═════════════
-- L'user soumet (ou re-soumet) sa pill. SECURITY DEFINER pour set
-- decided_at/by à null sans exposer ces colonnes en write côté RLS.

create or replace function public.propose_bingo_pill(
  p_pill_id uuid,
  p_message text default null
)
returns public.bingo_pills
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.bingo_pills;
begin
  select * into v_row
    from public.bingo_pills
   where id = p_pill_id;

  if not found then
    raise exception 'pill not found' using errcode = 'P0002';
  end if;

  if v_row.user_id <> auth.uid() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_row.status not in ('private', 'proposed') then
    raise exception 'cannot propose a pill in status %', v_row.status
      using errcode = '22023';
  end if;

  update public.bingo_pills
     set status = 'proposed',
         proposal_message = nullif(trim(coalesce(p_message, '')), ''),
         decision_reason = null,
         decided_at = null,
         decided_by = null
   where id = p_pill_id
   returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.propose_bingo_pill(uuid, text) to authenticated;

-- ═════════════ RPC decide_bingo_pill ═════════════
-- L'admin tranche : approve | reject | disable. Gate is_caller_admin (0059).

create or replace function public.decide_bingo_pill(
  p_pill_id uuid,
  p_decision text,
  p_reason text default null
)
returns public.bingo_pills
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next_status public.bingo_pill_status;
  v_row public.bingo_pills;
begin
  if not public.is_caller_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_next_status := case p_decision
    when 'approve' then 'public'::public.bingo_pill_status
    when 'reject'  then 'private'::public.bingo_pill_status
    when 'disable' then 'disabled'::public.bingo_pill_status
    else null
  end;

  if v_next_status is null then
    raise exception 'invalid decision: %', p_decision
      using errcode = '22023';
  end if;

  update public.bingo_pills
     set status = v_next_status,
         decision_reason = nullif(trim(coalesce(p_reason, '')), ''),
         decided_at = now(),
         decided_by = auth.uid()
   where id = p_pill_id
   returning * into v_row;

  if not found then
    raise exception 'pill not found' using errcode = 'P0002';
  end if;

  return v_row;
end;
$$;

grant execute on function public.decide_bingo_pill(uuid, text, text) to authenticated;

-- ═════════════ RPC delete_bingo_pill_safe ═════════════
-- Suppression côté app mobile : le trigger ci-dessus a un override admin
-- volontaire (pour l'admin web). Mais quand un admin teste son propre flow
-- mobile (cache local en `proposed`, DB déjà `public`), un DELETE direct
-- passerait via cet override et casserait l'invariant métier (« un user
-- ne doit pas supprimer une pill publique »).
--
-- Cette RPC applique l'invariant SANS regarder le rôle admin. L'admin web
-- garde le DELETE direct via la policy `admin all` (0033) quand une
-- suppression forcée est légitime.

create or replace function public.delete_bingo_pill_safe(p_pill_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.bingo_pills;
begin
  select * into v_row from public.bingo_pills where id = p_pill_id;
  if not found then
    raise exception 'pill not found' using errcode = 'P0002';
  end if;

  if v_row.user_id <> auth.uid() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_row.status = 'public' then
    raise exception 'Cannot delete a published bingo pill'
      using errcode = '42501';
  end if;

  delete from public.bingo_pills where id = p_pill_id;
  return p_pill_id;
end;
$$;

grant execute on function public.delete_bingo_pill_safe(uuid) to authenticated;
