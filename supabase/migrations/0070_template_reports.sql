-- 0070 — Signalements pour templates de fiches de lecture.
--
-- Ajoute le kind 'template' au flow de modération existant (cf. 0065) :
--   - whitelist user-side `report_content`
--   - switch-case admin (queue / user_reports / moderate)
--   - colonnes de soft-delete sur `reading_sheets_templates`
--   - filtre `removed_at is null` dans les RPCs de listing public.
--
-- Tout est idempotent (create or replace + if not exists) — sûr à re-jouer.

-- ═════════════ Colonnes soft-delete sur reading_sheets_templates ═════════════
-- Aligne le schéma sur reading_sheets / social_feed_entries / social_comments /
-- bingos : un admin peut soft-delete un template signalé sans détruire la
-- row (préserve l'historique de modération, et le cas owner-can-see-its-own
-- template-mais-public-gone reste géré via filtres).

alter table public.reading_sheets_templates
  add column if not exists removed_at     timestamptz,
  add column if not exists removed_by     uuid references auth.users(id) on delete set null,
  add column if not exists removed_reason text;

-- ═════════════ report_content : whitelist + owner lookup ═════════════
create or replace function public.report_content(
  p_target_kind text,
  p_target_id   uuid,
  p_reason      text,
  p_details     text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reporter uuid := auth.uid();
  v_owner    uuid;
  v_id       uuid;
begin
  if v_reporter is null then
    raise exception 'auth required' using errcode = '42501';
  end if;
  if p_target_kind not in ('feed_entry','comment','sheet','bingo','user','template') then
    raise exception 'invalid target_kind: %', p_target_kind using errcode = '22023';
  end if;

  case p_target_kind
    when 'feed_entry' then
      select actor_id into v_owner from public.social_feed_entries where id = p_target_id;
    when 'comment' then
      select user_id  into v_owner from public.social_comments    where id = p_target_id;
    when 'sheet' then
      select ub.user_id into v_owner
        from public.reading_sheets rs
        join public.user_books ub on ub.id = rs.user_book_id
       where rs.id = p_target_id;
    when 'bingo' then
      select user_id  into v_owner from public.bingos            where id = p_target_id;
    when 'user' then
      v_owner := p_target_id;
    when 'template' then
      select user_id  into v_owner from public.reading_sheets_templates where id = p_target_id;
  end case;

  if v_owner is null then
    raise exception 'target not found' using errcode = 'P0002';
  end if;
  if v_owner = v_reporter then
    raise exception 'cannot report your own content' using errcode = '42501';
  end if;

  insert into public.social_reports (reporter_id, target_kind, target_id, reason, details)
  values (v_reporter, p_target_kind, p_target_id, p_reason, p_details)
  on conflict (reporter_id, target_kind, target_id) do nothing
  returning id into v_id;

  if v_id is null then
    raise exception 'already reported' using errcode = '23505';
  end if;
  return v_id;
end;
$$;

grant execute on function public.report_content(text, uuid, text, text) to authenticated;

-- ═════════════ admin_moderation_queue ═════════════
-- Switch case `owner_id` étendu au template — sinon les signalements
-- template apparaîtraient avec owner_id null et seraient agrégés à part.
drop function if exists public.admin_moderation_queue(text);
create or replace function public.admin_moderation_queue(
  p_status_filter text default 'all'
)
returns table (
  owner_id           uuid,
  username           text,
  display_name       text,
  avatar_url         text,
  is_banned          boolean,
  pending_count      bigint,
  total_count        bigint,
  last_reported_at   timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._assert_admin();
  if p_status_filter not in ('pending','all','closed') then
    raise exception 'invalid status filter: %', p_status_filter using errcode = '22023';
  end if;
  return query
  with grouped as (
    select
      case r.target_kind
        when 'feed_entry' then (select actor_id from public.social_feed_entries where id = r.target_id)
        when 'comment'    then (select user_id  from public.social_comments    where id = r.target_id)
        when 'sheet'      then (select ub.user_id from public.reading_sheets rs
                                  join public.user_books ub on ub.id = rs.user_book_id
                                 where rs.id = r.target_id)
        when 'bingo'      then (select user_id  from public.bingos            where id = r.target_id)
        when 'user'       then r.target_id
        when 'template'   then (select user_id  from public.reading_sheets_templates where id = r.target_id)
      end as owner_id,
      r.status,
      r.created_at
    from public.social_reports r
  )
  select
    g.owner_id,
    p.username,
    p.display_name,
    p.avatar_url,
    p.banned_at is not null as is_banned,
    sum(case when g.status = 'pending' then 1 else 0 end)::bigint as pending_count,
    count(*)::bigint as total_count,
    max(g.created_at) as last_reported_at
  from grouped g
  join public.profiles p on p.id = g.owner_id
  where g.owner_id is not null
    and (
      p_status_filter = 'all'
      or (p_status_filter = 'pending' and exists (
        select 1 from public.social_reports rr
        where (
          case rr.target_kind
            when 'feed_entry' then (select actor_id from public.social_feed_entries where id = rr.target_id)
            when 'comment'    then (select user_id  from public.social_comments    where id = rr.target_id)
            when 'sheet'      then (select ub.user_id from public.reading_sheets rs
                                      join public.user_books ub on ub.id = rs.user_book_id
                                     where rs.id = rr.target_id)
            when 'bingo'      then (select user_id  from public.bingos            where id = rr.target_id)
            when 'user'       then rr.target_id
            when 'template'   then (select user_id  from public.reading_sheets_templates where id = rr.target_id)
          end
        ) = g.owner_id and rr.status = 'pending'
      ))
      or (p_status_filter = 'closed' and not exists (
        select 1 from public.social_reports rr
        where (
          case rr.target_kind
            when 'feed_entry' then (select actor_id from public.social_feed_entries where id = rr.target_id)
            when 'comment'    then (select user_id  from public.social_comments    where id = rr.target_id)
            when 'sheet'      then (select ub.user_id from public.reading_sheets rs
                                      join public.user_books ub on ub.id = rs.user_book_id
                                     where rs.id = rr.target_id)
            when 'bingo'      then (select user_id  from public.bingos            where id = rr.target_id)
            when 'user'       then rr.target_id
            when 'template'   then (select user_id  from public.reading_sheets_templates where id = rr.target_id)
          end
        ) = g.owner_id and rr.status = 'pending'
      ))
    )
  group by g.owner_id, p.username, p.display_name, p.avatar_url, p.banned_at
  order by max(g.created_at) desc;
end;
$$;

grant execute on function public.admin_moderation_queue(text) to authenticated;

-- ═════════════ admin_moderation_user_reports ═════════════
-- Ajoute la branche `template` au preview JSON et au owner lookup.
create or replace function public.admin_moderation_user_reports(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  perform public._assert_admin();
  with rows as (
    select
      r.id,
      r.target_kind,
      r.target_id,
      r.reason,
      r.details,
      r.status,
      r.created_at,
      r.reporter_id,
      rp.username     as reporter_username,
      rp.display_name as reporter_display_name,
      rp.avatar_url   as reporter_avatar_url,
      case r.target_kind
        when 'feed_entry' then (
          select jsonb_build_object(
            'verb', fe.verb,
            'meta', fe.meta,
            'visibility', fe.visibility,
            'created_at', fe.created_at,
            'removed_at', fe.removed_at
          ) from public.social_feed_entries fe where fe.id = r.target_id
        )
        when 'comment' then (
          select jsonb_build_object(
            'body', sc.body,
            'created_at', sc.created_at,
            'removed_at', sc.removed_at,
            'target_kind', sc.target_kind,
            'target_id', sc.target_id
          ) from public.social_comments sc where sc.id = r.target_id
        )
        when 'sheet' then (
          select jsonb_build_object(
            'content', rs.content,
            'is_public', rs.is_public,
            'updated_at', rs.updated_at,
            'removed_at', rs.removed_at
          ) from public.reading_sheets rs where rs.id = r.target_id
        )
        when 'bingo' then (
          select jsonb_build_object(
            'title', b.title,
            'created_at', b.created_at,
            'removed_at', b.removed_at
          ) from public.bingos b where b.id = r.target_id
        )
        when 'user' then (
          select jsonb_build_object(
            'username', pp.username,
            'display_name', pp.display_name,
            'avatar_url', pp.avatar_url
          ) from public.profiles pp where pp.id = r.target_id
        )
        when 'template' then (
          select jsonb_build_object(
            'name', t.name,
            'is_public', t.is_public,
            'genres', t.genres,
            'updated_at', t.updated_at,
            'removed_at', t.removed_at
          ) from public.reading_sheets_templates t where t.id = r.target_id
        )
      end as preview,
      case r.target_kind
        when 'feed_entry' then (select actor_id from public.social_feed_entries where id = r.target_id)
        when 'comment'    then (select user_id  from public.social_comments    where id = r.target_id)
        when 'sheet'      then (select ub.user_id from public.reading_sheets rs
                                  join public.user_books ub on ub.id = rs.user_book_id
                                 where rs.id = r.target_id)
        when 'bingo'      then (select user_id  from public.bingos            where id = r.target_id)
        when 'user'       then r.target_id
        when 'template'   then (select user_id  from public.reading_sheets_templates where id = r.target_id)
      end as owner_id
    from public.social_reports r
    left join public.profiles rp on rp.id = r.reporter_id
  )
  select jsonb_agg(to_jsonb(rows) order by rows.created_at desc)
    into v
    from rows
   where rows.owner_id = p_user_id;
  return coalesce(v, '[]'::jsonb);
end;
$$;

grant execute on function public.admin_moderation_user_reports(uuid) to authenticated;

-- ═════════════ admin_moderate ═════════════
-- Étend le owner lookup + ajoute la branche soft-delete pour les templates.
create or replace function public.admin_moderate(
  p_report_ids uuid[],
  p_action     text,
  p_reason     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_recipients jsonb := '[]'::jsonb;
  r record;
  v_owner uuid;
begin
  perform public._assert_admin();
  if p_action not in ('delete','delete_and_ban','ignore') then
    raise exception 'invalid action: %', p_action using errcode = '22023';
  end if;
  if p_report_ids is null or array_length(p_report_ids, 1) is null then
    raise exception 'empty report_ids' using errcode = '22023';
  end if;

  for r in
    select id, target_kind, target_id
      from public.social_reports
     where id = any(p_report_ids)
  loop
    case r.target_kind
      when 'feed_entry' then
        select actor_id into v_owner from public.social_feed_entries where id = r.target_id;
      when 'comment' then
        select user_id  into v_owner from public.social_comments    where id = r.target_id;
      when 'sheet' then
        select ub.user_id into v_owner
          from public.reading_sheets rs
          join public.user_books ub on ub.id = rs.user_book_id
         where rs.id = r.target_id;
      when 'bingo' then
        select user_id  into v_owner from public.bingos            where id = r.target_id;
      when 'user' then
        v_owner := r.target_id;
      when 'template' then
        select user_id  into v_owner from public.reading_sheets_templates where id = r.target_id;
    end case;

    if p_action <> 'ignore' and v_owner is not null then
      if r.target_kind = 'feed_entry' then
        update public.social_feed_entries
           set removed_at = coalesce(removed_at, now()),
               removed_by = coalesce(removed_by, v_admin),
               removed_reason = coalesce(removed_reason, p_reason)
         where id = r.target_id;
      elsif r.target_kind = 'comment' then
        update public.social_comments
           set removed_at = coalesce(removed_at, now()),
               removed_by = coalesce(removed_by, v_admin),
               removed_reason = coalesce(removed_reason, p_reason)
         where id = r.target_id;
      elsif r.target_kind = 'sheet' then
        update public.reading_sheets
           set removed_at = coalesce(removed_at, now()),
               removed_by = coalesce(removed_by, v_admin),
               removed_reason = coalesce(removed_reason, p_reason)
         where id = r.target_id;
      elsif r.target_kind = 'bingo' then
        update public.bingos
           set removed_at = coalesce(removed_at, now()),
               removed_by = coalesce(removed_by, v_admin),
               removed_reason = coalesce(removed_reason, p_reason)
         where id = r.target_id;
      elsif r.target_kind = 'template' then
        update public.reading_sheets_templates
           set removed_at = coalesce(removed_at, now()),
               removed_by = coalesce(removed_by, v_admin),
               removed_reason = coalesce(removed_reason, p_reason)
         where id = r.target_id;
      end if;

      if p_action = 'delete_and_ban' or r.target_kind = 'user' then
        update public.profiles
           set banned_at = coalesce(banned_at, now()),
               banned_reason = coalesce(banned_reason, p_reason),
               banned_by = coalesce(banned_by, v_admin)
         where id = v_owner;
      end if;

      v_recipients := v_recipients || jsonb_build_object(
        'user_id', v_owner,
        'role', 'author',
        'kind', r.target_kind,
        'target_id', r.target_id
      );
      v_recipients := v_recipients || (
        select coalesce(jsonb_agg(jsonb_build_object(
          'user_id', sr.reporter_id,
          'role', 'reporter',
          'kind', r.target_kind,
          'target_id', r.target_id
        )), '[]'::jsonb)
        from public.social_reports sr
        where sr.target_kind = r.target_kind and sr.target_id = r.target_id
      );
    end if;
  end loop;

  update public.social_reports
     set status = case when p_action = 'ignore' then 'dismissed' else 'actioned' end,
         reviewed_by = v_admin,
         reviewed_at = now()
   where id = any(p_report_ids);

  return jsonb_build_object('recipients', v_recipients);
end;
$$;

grant execute on function public.admin_moderate(uuid[], text, text) to authenticated;

-- ═════════════ list_public_templates : filtre removed ═════════════
-- Un template soft-deleted disparait de la galerie publique. Le creator
-- voit toujours sa row côté `mine` (fetchMine ne passe pas par cette RPC)
-- mais ne peut plus la repartager tant que l'admin n'a pas restauré.
create or replace function public.list_public_templates(
  p_search          text default null,
  p_genres          text[] default null,
  p_sort            text default 'popular',
  p_include_premium boolean default true,
  p_creator_id      uuid default null,
  p_limit           integer default 30,
  p_offset          integer default 0
)
returns table (
  template_id     uuid,
  user_id         uuid,
  name            text,
  content         jsonb,
  genres          text[],
  is_premium      boolean,
  likes_count     integer,
  forked_from_id  uuid,
  created_at      timestamptz,
  updated_at      timestamptz,
  creator_display_name text,
  creator_avatar_url   text,
  creator_username     text,
  is_liked        boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id            as template_id,
    t.user_id,
    t.name,
    t.content,
    t.genres,
    t.is_premium,
    t.likes_count,
    t.forked_from_id,
    t.created_at,
    t.updated_at,
    p.display_name  as creator_display_name,
    p.avatar_url    as creator_avatar_url,
    p.username      as creator_username,
    exists (
      select 1 from public.reading_sheets_template_likes l
       where l.template_id = t.id and l.user_id = auth.uid()
    ) as is_liked
  from public.reading_sheets_templates t
  join public.profiles p on p.id = t.user_id
  where t.is_public = true
    and t.removed_at is null
    and (p_creator_id is null or t.user_id = p_creator_id)
    and (p_include_premium or t.is_premium = false)
    and (
      p_search is null or p_search = ''
      or t.name ilike '%' || p_search || '%'
      or p.display_name ilike '%' || p_search || '%'
      or p.username ilike '%' || p_search || '%'
    )
    and (
      p_genres is null or array_length(p_genres, 1) is null
      or t.genres && p_genres
    )
  order by
    case when p_sort = 'liked' then t.likes_count end desc nulls last,
    case when p_sort = 'recent' or p_sort = 'popular' then t.updated_at end desc nulls last,
    t.id desc
  limit greatest(coalesce(p_limit, 30), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

grant execute on function public.list_public_templates(text, text[], text, boolean, uuid, integer, integer) to authenticated;

-- ═════════════ get_public_template : filtre removed ═════════════
-- L'owner reste autorisé à voir sa propre row (même soft-deleted, utile
-- pour comprendre pourquoi son template a disparu de la galerie).
create or replace function public.get_public_template(p_template_id uuid)
returns table (
  template_id     uuid,
  user_id         uuid,
  name            text,
  content         jsonb,
  genres          text[],
  is_public       boolean,
  is_premium      boolean,
  likes_count     integer,
  forked_from_id  uuid,
  created_at      timestamptz,
  updated_at      timestamptz,
  creator_display_name text,
  creator_avatar_url   text,
  creator_username     text,
  is_liked        boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id            as template_id,
    t.user_id,
    t.name,
    t.content,
    t.genres,
    t.is_public,
    t.is_premium,
    t.likes_count,
    t.forked_from_id,
    t.created_at,
    t.updated_at,
    p.display_name  as creator_display_name,
    p.avatar_url    as creator_avatar_url,
    p.username      as creator_username,
    exists (
      select 1 from public.reading_sheets_template_likes l
       where l.template_id = t.id and l.user_id = auth.uid()
    ) as is_liked
  from public.reading_sheets_templates t
  join public.profiles p on p.id = t.user_id
  where t.id = p_template_id
    and (t.removed_at is null or t.user_id = auth.uid())
    and (t.is_public = true or t.user_id = auth.uid());
$$;

grant execute on function public.get_public_template(uuid) to authenticated;
