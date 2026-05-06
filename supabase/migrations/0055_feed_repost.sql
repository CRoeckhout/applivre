-- 0055 — Republication (repost / quote-repost) d'une entry de feed.
--
-- Modèle : on AJOUTE un verbe `'reposted'` dans social_feed_entries (pas
-- de table dédiée). Une row repost porte :
--   actor_id    = user qui republie (User B)
--   verb        = 'reposted'
--   target_kind = 'feed_entry'
--   target_id   = id de l'entry source (User A)
--   meta        = { note: text? }      (quote-repost optionnel)
--   visibility  = 'public'             (toujours, cf. spec)
--
-- L'engagement (commentaires, réactions) reste attaché à l'entry SOURCE
-- côté UI — le renderer détecte verb='reposted', fetch la source via
-- target_id, et target=source.id pour les compteurs. Pas de fragmentation.
--
-- Contraintes :
--   - 1 repost max par (actor, target)            : index unique partiel
--   - pas d'auto-repost                            : check côté RPC
--   - pas de repost-of-repost                      : check côté RPC
--   - source publique uniquement                   : check côté RPC
--   - visibilité forcée à 'public'                 : check côté RPC
--   - delete cascade : supprimer une entry purge   : trigger ci-dessous
--     ses reposts (sinon broken refs)

-- ---------------------------------------------------------------------------
-- Unicité : un user ne peut reposter une même entry qu'une seule fois.
-- L'index est partiel (where verb='reposted') pour ne pas perturber les
-- autres verbes (un même user peut très bien partager une fiche puis
-- liker un livre référencés par le même target_id par hasard de typage).
-- ---------------------------------------------------------------------------
create unique index if not exists social_feed_entries_repost_unique
  on public.social_feed_entries (actor_id, target_id)
  where verb = 'reposted';

-- ---------------------------------------------------------------------------
-- Trigger : quand une entry est supprimée, on supprime aussi tous les
-- reposts qui pointent dessus. Sinon les reposts apparaitraient avec une
-- source manquante côté UI (et le renderer rendrait un placeholder).
-- ---------------------------------------------------------------------------
create or replace function public.cascade_delete_feed_reposts()
returns trigger
language plpgsql
as $$
begin
  delete from public.social_feed_entries
  where verb = 'reposted'
    and target_kind = 'feed_entry'
    and target_id = OLD.id;
  return OLD;
end;
$$;

drop trigger if exists social_feed_entries_cascade_reposts on public.social_feed_entries;
create trigger social_feed_entries_cascade_reposts
before delete on public.social_feed_entries
for each row execute function public.cascade_delete_feed_reposts();

-- ---------------------------------------------------------------------------
-- repost_feed_entry : republie une entry source dans le feed du caller.
-- Idempotent — un second appel sur la même source renvoie l'id existant.
-- p_note (optionnel) ajoute un quote-repost (rendu au-dessus de la source
-- dans le feed). Vide / blank → meta sans note.
-- ---------------------------------------------------------------------------
create or replace function public.repost_feed_entry(
  p_entry_id uuid,
  p_note     text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id     uuid := auth.uid();
  v_src_actor   uuid;
  v_src_visib   text;
  v_src_verb    text;
  v_existing    uuid;
  v_new_id      uuid;
  v_note        text;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  -- Source : doit exister, être publique, ne pas être elle-même un repost,
  -- et appartenir à un autre user.
  select actor_id, visibility, verb
    into v_src_actor, v_src_visib, v_src_verb
  from public.social_feed_entries
  where id = p_entry_id;

  if v_src_actor is null then
    raise exception 'feed entry % not found', p_entry_id;
  end if;
  if v_src_visib <> 'public' then
    raise exception 'cannot repost a non-public entry';
  end if;
  if v_src_verb = 'reposted' then
    raise exception 'cannot repost a repost';
  end if;
  if v_src_actor = v_user_id then
    raise exception 'cannot repost your own entry';
  end if;

  -- Idempotent : si déjà reposté, on renvoie l'id existant. Le note
  -- éventuel n'est PAS écrasé silencieusement (l'edit explicite n'est pas
  -- exposé v1 — supprimer puis recréer reste possible côté client).
  select id into v_existing
  from public.social_feed_entries
  where actor_id = v_user_id
    and verb = 'reposted'
    and target_kind = 'feed_entry'
    and target_id = p_entry_id
  limit 1;

  if v_existing is not null then
    return v_existing;
  end if;

  v_note := nullif(trim(coalesce(p_note, '')), '');

  insert into public.social_feed_entries
    (actor_id, verb, target_kind, target_id, meta, visibility)
  values (
    v_user_id,
    'reposted',
    'feed_entry',
    p_entry_id,
    case when v_note is null
         then '{}'::jsonb
         else jsonb_build_object('note', v_note)
    end,
    'public'
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

grant execute on function public.repost_feed_entry(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- unrepost_feed_entry : retire le repost du caller pour une source donnée.
-- ---------------------------------------------------------------------------
create or replace function public.unrepost_feed_entry(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  delete from public.social_feed_entries
  where actor_id = v_user_id
    and verb = 'reposted'
    and target_kind = 'feed_entry'
    and target_id = p_entry_id;
end;
$$;

grant execute on function public.unrepost_feed_entry(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- get_feed_repost_summary : compteur global + my_repost_id (highlight).
-- Lecture publique (la table est déjà RLS-publique pour le select).
-- ---------------------------------------------------------------------------
create or replace function public.get_feed_repost_summary(p_entry_id uuid)
returns table (
  count          int,
  my_repost_id   uuid
)
language sql
security definer
set search_path = public
stable
as $$
  select
    (
      select count(*)::int
      from public.social_feed_entries
      where verb = 'reposted'
        and target_kind = 'feed_entry'
        and target_id = p_entry_id
    ) as count,
    (
      select id
      from public.social_feed_entries
      where verb = 'reposted'
        and target_kind = 'feed_entry'
        and target_id = p_entry_id
        and actor_id = auth.uid()
      limit 1
    ) as my_repost_id;
$$;

grant execute on function public.get_feed_repost_summary(uuid) to authenticated;
