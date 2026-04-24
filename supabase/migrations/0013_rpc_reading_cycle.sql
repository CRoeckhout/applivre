-- 0013 — RPC atomiques pour le cycle de lecture
-- Regroupe plusieurs écritures en 1 transaction serveur. Le client peut
-- rester naïf (1 appel → plusieurs mutations cohérentes côté DB).

-- ═════════════ start_reading_session ═════════════
-- Crée ou retourne le cycle ouvert pour un livre, passe le livre en
-- 'reading' et stamp started_at s'il est encore null.
create or replace function public.start_reading_session(
  p_user_book_id uuid
)
returns public.read_cycles
language plpgsql
security invoker
as $$
declare
  ub record;
  existing public.read_cycles;
  next_idx int;
  created public.read_cycles;
begin
  -- Vérif ownership (RLS filtre déjà la lecture mais on préfère un
  -- message clair que "not found").
  select id, user_id into ub
  from public.user_books where id = p_user_book_id;
  if not found or ub.user_id is distinct from auth.uid() then
    raise exception 'user_book introuvable ou non autorisé'
      using errcode = '42501';
  end if;

  -- Cycle ouvert déjà présent ?
  select * into existing
  from public.read_cycles
  where user_book_id = p_user_book_id and finished_at is null
  limit 1;
  if found then
    return existing;
  end if;

  -- Index suivant
  select coalesce(max(index), 0) + 1 into next_idx
  from public.read_cycles where user_book_id = p_user_book_id;

  insert into public.read_cycles (user_book_id, index)
  values (p_user_book_id, next_idx)
  returning * into created;

  update public.user_books
  set status = 'reading',
      started_at = coalesce(started_at, now())
  where id = p_user_book_id;

  return created;
end;
$$;

-- ═════════════ finish_reading_cycle ═════════════
-- Ferme le cycle ouvert + bascule user_books.status + stamp finished_at
-- si outcome = 'read'. Tout en 1 transaction.
create or replace function public.finish_reading_cycle(
  p_user_book_id uuid,
  p_outcome public.read_cycle_outcome,
  p_final_page int default null
)
returns public.read_cycles
language plpgsql
security invoker
as $$
declare
  ub record;
  closed public.read_cycles;
begin
  select id, user_id into ub
  from public.user_books where id = p_user_book_id;
  if not found or ub.user_id is distinct from auth.uid() then
    raise exception 'user_book introuvable ou non autorisé'
      using errcode = '42501';
  end if;

  update public.read_cycles
  set finished_at = now(),
      outcome = p_outcome,
      final_page = p_final_page
  where user_book_id = p_user_book_id and finished_at is null
  returning * into closed;

  if not found then
    -- Idempotent : pas de cycle ouvert → rien à faire, mais on remonte
    -- le dernier cycle pour un feedback utile côté client.
    select * into closed
    from public.read_cycles
    where user_book_id = p_user_book_id
    order by index desc
    limit 1;
  end if;

  update public.user_books
  set status = p_outcome::text::public.reading_status,
      finished_at = case
        when p_outcome = 'read' then now()
        else finished_at
      end
  where id = p_user_book_id;

  return closed;
end;
$$;

grant execute on function public.start_reading_session(uuid) to authenticated;
grant execute on function public.finish_reading_cycle(uuid, public.read_cycle_outcome, int) to authenticated;
