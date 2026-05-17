-- ---------------------------------------------------------------------------
-- Découple `reading_sheets.is_public` de la création d'une entry feed
-- `shared_sheet`. Le trigger introduit par 0051 (emit_shared_sheet_on_publish)
-- créait une entry automatiquement au moindre flip is_public→true — y compris
-- quand l'user fermait la ShareSheetModal via "Non merci" → feed_entries
-- orphelines sans intention de partage.
--
-- Nouveau modèle :
--   - is_public = true  → la fiche est consultable (profil, lien direct,
--     listings publics). Aucun side-effect feed.
--   - publish_shared_sheet(...) → l'user a explicitement validé "Publier"
--     dans la modale → on insère la feed_entry shared_sheet avec un
--     post_text facultatif embarqué dans le meta dès l'insert.
-- ---------------------------------------------------------------------------

drop trigger if exists reading_sheets_emit_shared_sheet on public.reading_sheets;
drop function if exists public.emit_shared_sheet_on_publish();

-- ---------------------------------------------------------------------------
-- publish_shared_sheet(p_sheet_id, p_post_text)
--
-- Insère une entry social_feed_entries `shared_sheet` pour la fiche
-- spécifiée. La fiche doit être publique (sinon raise) et appartenir à
-- l'user courant. `post_text` optionnel : si non vide après trim, embarqué
-- dans meta.post_text dès l'insertion.
--
-- Retourne l'id de la nouvelle entry pour permettre à l'UI d'invalider /
-- mettre à jour le cache du feed local immédiatement.
-- ---------------------------------------------------------------------------
create or replace function public.publish_shared_sheet(
  p_sheet_id uuid,
  p_post_text text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id  uuid;
  v_book_isbn text;
  v_is_public boolean;
  v_clean     text;
  v_meta      jsonb;
  v_entry_id  uuid;
begin
  select ub.user_id, ub.book_isbn, rs.is_public
    into v_owner_id, v_book_isbn, v_is_public
  from public.reading_sheets rs
  join public.user_books ub on ub.id = rs.user_book_id
  where rs.id = p_sheet_id;

  if v_owner_id is null then
    raise exception 'sheet % not found', p_sheet_id;
  end if;
  if v_owner_id <> auth.uid() then
    raise exception 'forbidden';
  end if;
  if v_is_public is not true then
    -- Garde-fou : on refuse de publier au feed une fiche non publique.
    -- L'UI ne doit appeler cette RPC qu'après avoir bien flip is_public.
    raise exception 'sheet_not_public';
  end if;

  v_clean := nullif(trim(coalesce(p_post_text, '')), '');
  v_meta := jsonb_build_object('book_isbn', v_book_isbn);
  if v_clean is not null then
    v_meta := v_meta || jsonb_build_object('post_text', v_clean);
  end if;

  insert into public.social_feed_entries
    (actor_id, verb, target_kind, target_id, meta, visibility, created_at)
  values
    (v_owner_id, 'shared_sheet', 'sheet', p_sheet_id, v_meta, 'public', now())
  returning id into v_entry_id;

  return v_entry_id;
end;
$$;

grant execute on function public.publish_shared_sheet(uuid, text) to authenticated;
