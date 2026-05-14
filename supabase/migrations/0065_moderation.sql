-- 0065 — Modération : signalements, soft-delete, ban, enquête.
--
-- Feature complète "signalement de contenu" : un user signale du feed,
-- comment, sheet, bingo ou un autre user via le RPC `report_content`.
-- L'admin examine via `admin_moderation_queue` + `admin_moderation_user_reports`
-- et agit via `admin_moderate` (delete | delete_and_ban | ignore). Les
-- contenus retirés et les contenus d'auteurs bannis sont masqués partout
-- (RLS + RPC SECURITY DEFINER patchées). La communication post-modération
-- passe par la messagerie in-app : `admin_send_moderation_message` crée
-- un thread depuis le compte de l'admin en bypass du gate
-- `social_can_message`.
--
-- Plan du fichier :
--   1. Soft-delete sur les 4 tables de contenu
--   2. Colonnes ban sur profiles + helper is_user_banned + trigger guard
--   3. RLS : masque contenus retirés + auteurs bannis
--   4. RPC user : report_content
--   5. RPCs admin : queue, detail, moderate, ban/unban, badge count, send_message
--   6. admin_user_profile étendu pour exposer banned_*
--   7. RPCs admin investigation : stats, recent content, reporter fiabilité,
--      content context
--   8. Patches des RPC SECURITY DEFINER existantes (get_feed,
--      get_feed_entry, list_*_comments, get_public_sheet, list_public_sheets_*)
--      pour filtrer removed_at + bannis (sinon le bypass RLS rend la
--      modération invisible).

-- ═══════════════ 1. Soft-delete ═══════════════
alter table public.social_feed_entries
  add column if not exists removed_at timestamptz,
  add column if not exists removed_by uuid references auth.users(id) on delete set null,
  add column if not exists removed_reason text;

alter table public.social_comments
  add column if not exists removed_at timestamptz,
  add column if not exists removed_by uuid references auth.users(id) on delete set null,
  add column if not exists removed_reason text;

alter table public.reading_sheets
  add column if not exists removed_at timestamptz,
  add column if not exists removed_by uuid references auth.users(id) on delete set null,
  add column if not exists removed_reason text;

alter table public.bingos
  add column if not exists removed_at timestamptz,
  add column if not exists removed_by uuid references auth.users(id) on delete set null,
  add column if not exists removed_reason text;

create index if not exists social_feed_entries_removed_idx
  on public.social_feed_entries (removed_at) where removed_at is null;
create index if not exists social_comments_removed_idx
  on public.social_comments (removed_at) where removed_at is null;

-- ═══════════════ 2. Ban + helper ═══════════════
alter table public.profiles
  add column if not exists banned_at timestamptz,
  add column if not exists banned_reason text,
  add column if not exists banned_by uuid references auth.users(id) on delete set null;

create index if not exists profiles_banned_idx
  on public.profiles (banned_at) where banned_at is not null;

create or replace function public.is_user_banned(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.banned_at is not null from public.profiles p where p.id = p_user_id),
    false
  );
$$;

grant execute on function public.is_user_banned(uuid) to authenticated;

-- Trigger garde-fou : banned_* ne bouge que via les RPC admin (SECURITY
-- DEFINER) ou service_role. Empêche un user banni de s'auto-débannir.
create or replace function public.guard_profiles_banned()
returns trigger
language plpgsql
as $$
begin
  if (new.banned_at is distinct from old.banned_at
      or new.banned_reason is distinct from old.banned_reason
      or new.banned_by is distinct from old.banned_by)
     and coalesce(auth.role(), 'anon') <> 'service_role' then
    raise exception 'profiles.banned_* can only be changed via admin RPCs'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_banned on public.profiles;
create trigger profiles_protect_banned
  before update on public.profiles
  for each row
  execute function public.guard_profiles_banned();

-- ═══════════════ 3. RLS : masque contenus retirés + auteurs bannis ═══════════════
-- État final voulu : aucun non-admin ne voit du contenu removed_at ; un
-- contenu d'auteur banni est invisible aux autres mais l'auteur lui-même
-- voit ses entrées non-removed (cohérence UX avec le ban "doux").

-- social_feed_entries : version finale (post-067).
drop policy if exists "social_feed_entries_select_visible" on public.social_feed_entries;
create policy "social_feed_entries_select_visible"
  on public.social_feed_entries
  for select
  using (
    removed_at is null
    and (
      auth.uid() = actor_id
      or (
        not public.is_user_banned(actor_id)
        and (
          visibility = 'public'
          or (
            visibility = 'followers'
            and exists (
              select 1 from public.social_follows
              where follower_id = auth.uid() and followed_id = actor_id
            )
          )
        )
      )
    )
  );

drop policy if exists "social_feed_entries_insert_self" on public.social_feed_entries;
create policy "social_feed_entries_insert_self"
  on public.social_feed_entries
  for insert
  with check (auth.uid() = actor_id and not public.is_user_banned(auth.uid()));

-- social_comments : on garde la lecture publique des comments non-removed
-- (le placeholder "[supprimé par l'auteur]" est géré côté API via deleted_at).
drop policy if exists "social_comments_select_all" on public.social_comments;
create policy "social_comments_select_all"
  on public.social_comments
  for select
  using (
    auth.uid() = user_id
    or (removed_at is null and not public.is_user_banned(user_id))
  );

drop policy if exists "social_comments_insert_self" on public.social_comments;
create policy "social_comments_insert_self"
  on public.social_comments
  for insert
  with check (auth.uid() = user_id and not public.is_user_banned(auth.uid()));

-- reading_sheets : la SELECT 0001 a 2 branches (owner | is_public). On la
-- réécrit avec exclusion removed + ban pour la branche publique. La WRITE
-- (FOR ALL) garde son using existant mais resserre with check pour bannis.
drop policy if exists "reading_sheets private or owner" on public.reading_sheets;
create policy "reading_sheets private or owner" on public.reading_sheets
  for select
  using (
    exists (
      select 1 from public.user_books ub
      where ub.id = user_book_id and ub.user_id = auth.uid()
    )
    or (
      is_public
      and removed_at is null
      and exists (
        select 1 from public.user_books ub
        where ub.id = user_book_id
          and not public.is_user_banned(ub.user_id)
      )
    )
  );

drop policy if exists "reading_sheets write owner" on public.reading_sheets;
create policy "reading_sheets write owner" on public.reading_sheets
  for all
  using (
    exists (select 1 from public.user_books ub where ub.id = user_book_id and ub.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.user_books ub where ub.id = user_book_id and ub.user_id = auth.uid())
    and not public.is_user_banned(auth.uid())
  );

-- bingos : self-only à l'origine (0001). On resserre with check pour bloquer
-- les bannis sur INSERT/UPDATE.
drop policy if exists "bingos self" on public.bingos;
create policy "bingos self" on public.bingos
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and not public.is_user_banned(auth.uid()));

-- ═══════════════ 4. RPC user : report_content ═══════════════
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
  if p_target_kind not in ('feed_entry','comment','sheet','bingo','user') then
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

-- ═══════════════ 5. RPCs admin de modération ═══════════════

-- 5.1 Queue groupée par user concerné, filtrée par statut.
-- 'pending' : au moins un report status='pending'
-- 'closed'  : tous les reports actioned/dismissed
-- 'all'     : tous les owners avec >=1 report
drop function if exists public.admin_moderation_queue();
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
  left join public.profiles p on p.id = g.owner_id
  where g.owner_id is not null
  group by g.owner_id, p.username, p.display_name, p.avatar_url, p.banned_at
  having (
    (p_status_filter = 'all')
    or (p_status_filter = 'pending'
        and sum(case when g.status = 'pending' then 1 else 0 end) > 0)
    or (p_status_filter = 'closed'
        and sum(case when g.status = 'pending' then 1 else 0 end) = 0
        and count(*) > 0)
  )
  order by
    case when p_status_filter = 'pending' then
      sum(case when g.status = 'pending' then 1 else 0 end)
    end desc nulls last,
    max(g.created_at) desc;
end;
$$;

grant execute on function public.admin_moderation_queue(text) to authenticated;

-- 5.2 Détail des reports sur un user, avec preview du contenu signalé.
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
      end as preview,
      case r.target_kind
        when 'feed_entry' then (select actor_id from public.social_feed_entries where id = r.target_id)
        when 'comment'    then (select user_id  from public.social_comments    where id = r.target_id)
        when 'sheet'      then (select ub.user_id from public.reading_sheets rs
                                  join public.user_books ub on ub.id = rs.user_book_id
                                 where rs.id = r.target_id)
        when 'bingo'      then (select user_id  from public.bingos            where id = r.target_id)
        when 'user'       then r.target_id
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

-- 5.3 Action sur une liste de reports.
--   - 'delete'         : soft-delete contenu, status → actioned
--   - 'delete_and_ban' : idem + ban auteur
--   - 'ignore'         : status → dismissed (aucune action contenu)
-- target='user' : 'delete' équivaut à ban (pas de contenu unique à retirer).
-- Retourne les recipients à notifier (auteur + reporters).
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
  v_admin     uuid := auth.uid();
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

-- 5.4 Ban / unban manuel (vue user-detail).
create or replace function public.admin_ban_user(p_user_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
begin
  perform public._assert_admin();
  if p_user_id = v_admin then
    raise exception 'cannot ban yourself' using errcode = '42501';
  end if;
  update public.profiles
     set banned_at = coalesce(banned_at, now()),
         banned_reason = coalesce(p_reason, banned_reason),
         banned_by = v_admin
   where id = p_user_id;
end;
$$;

grant execute on function public.admin_ban_user(uuid, text) to authenticated;

create or replace function public.admin_unban_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._assert_admin();
  update public.profiles
     set banned_at = null,
         banned_reason = null,
         banned_by = null
   where id = p_user_id;
end;
$$;

grant execute on function public.admin_unban_user(uuid) to authenticated;

-- 5.5 Badge sidebar : nb reports non-statués (= status='pending').
-- Décrémente uniquement quand l'admin moderate, pas à l'ouverture.
create or replace function public.admin_unread_reports_count()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  perform public._assert_admin();
  select count(*)::int into v_count
    from public.social_reports
   where status = 'pending';
  return coalesce(v_count, 0);
end;
$$;

grant execute on function public.admin_unread_reports_count() to authenticated;

-- 5.6 Envoi d'un message de modération depuis le compte de l'admin.
-- Bypass social_can_message (modération > préférences user). Le thread
-- est créé en 'accepted' pour que le user puisse répondre.
create or replace function public.admin_send_moderation_message(
  p_to_user_id uuid,
  p_body       text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin    uuid := auth.uid();
  v_user_a   uuid;
  v_user_b   uuid;
  v_thread   uuid;
  v_msg      uuid;
begin
  perform public._assert_admin();
  if v_admin is null then
    raise exception 'auth required' using errcode = '42501';
  end if;
  if p_to_user_id = v_admin then
    raise exception 'cannot message yourself' using errcode = '42501';
  end if;
  if p_body is null or length(trim(p_body)) = 0 then
    raise exception 'empty body' using errcode = '22023';
  end if;

  v_user_a := least(v_admin, p_to_user_id);
  v_user_b := greatest(v_admin, p_to_user_id);

  insert into public.social_message_threads (user_a, user_b, initiator_id, state)
  values (v_user_a, v_user_b, v_admin, 'accepted')
  on conflict (user_a, user_b) do update
     set state = case
       when public.social_message_threads.state = 'blocked'
         then 'accepted'
       else public.social_message_threads.state
     end
  returning id into v_thread;

  if v_thread is null then
    select id into v_thread
      from public.social_message_threads
     where user_a = v_user_a and user_b = v_user_b;
  end if;

  insert into public.social_messages (thread_id, sender_id, body)
  values (v_thread, v_admin, p_body)
  returning id into v_msg;

  return v_msg;
end;
$$;

grant execute on function public.admin_send_moderation_message(uuid, text) to authenticated;

-- ═══════════════ 6. admin_user_profile étendu (banned_*) ═══════════════
-- Override de 0064 pour exposer le statut ban au panel user-detail.
create or replace function public.admin_user_profile(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  perform public._assert_admin();
  select jsonb_build_object(
    'id',             p.id,
    'username',       p.username,
    'display_name',   p.display_name,
    'avatar_url',     p.avatar_url,
    'is_premium',     p.is_premium,
    'is_admin',       p.is_admin,
    'premium_until',  p.premium_until,
    'preferences',    p.preferences,
    'created_at',     p.created_at,
    'banned_at',      p.banned_at,
    'banned_reason',  p.banned_reason,
    'banned_by',      p.banned_by
  )
    into v
    from public.profiles p
   where p.id = p_user_id;
  return v;
end;
$$;

-- ═══════════════ 7. RPCs admin enquête ═══════════════

-- 7.1 Stats agrégées sur le user signalé.
create or replace function public.admin_user_moderation_stats(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  perform public._assert_admin();
  with reports_on as (
    select r.*
      from public.social_reports r
     where (r.target_kind = 'user' and r.target_id = p_user_id)
        or (r.target_kind = 'feed_entry' and exists (
              select 1 from public.social_feed_entries fe
               where fe.id = r.target_id and fe.actor_id = p_user_id))
        or (r.target_kind = 'comment' and exists (
              select 1 from public.social_comments sc
               where sc.id = r.target_id and sc.user_id = p_user_id))
        or (r.target_kind = 'sheet' and exists (
              select 1 from public.reading_sheets rs
                join public.user_books ub on ub.id = rs.user_book_id
               where rs.id = r.target_id and ub.user_id = p_user_id))
        or (r.target_kind = 'bingo' and exists (
              select 1 from public.bingos b
               where b.id = r.target_id and b.user_id = p_user_id))
  )
  select jsonb_build_object(
    'total',                count(*),
    'pending',              count(*) filter (where status = 'pending'),
    'reviewed',             count(*) filter (where status = 'reviewed'),
    'actioned',             count(*) filter (where status = 'actioned'),
    'dismissed',            count(*) filter (where status = 'dismissed'),
    'distinct_reporters',   count(distinct reporter_id),
    'first_reported_at',    min(created_at),
    'last_reported_at',     max(created_at),
    'banned_at',            (select banned_at     from public.profiles where id = p_user_id),
    'banned_reason',        (select banned_reason from public.profiles where id = p_user_id),
    'banned_by',            (select banned_by     from public.profiles where id = p_user_id),
    'removed_content_count', (
      (select count(*) from public.social_feed_entries
        where actor_id = p_user_id and removed_at is not null)
      + (select count(*) from public.social_comments
          where user_id = p_user_id and removed_at is not null)
      + (select count(*) from public.reading_sheets rs
          join public.user_books ub on ub.id = rs.user_book_id
         where ub.user_id = p_user_id and rs.removed_at is not null)
      + (select count(*) from public.bingos
          where user_id = p_user_id and removed_at is not null)
    )
  )
    into v
    from reports_on;
  return v;
end;
$$;

grant execute on function public.admin_user_moderation_stats(uuid) to authenticated;

-- 7.2 Activité récente (feeds + comments + sheets mêlés).
create or replace function public.admin_user_recent_content(
  p_user_id uuid,
  p_limit   int default 20
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  perform public._assert_admin();
  with unioned as (
    select 'feed_entry' as kind, fe.id as target_id, fe.created_at,
           fe.removed_at,
           jsonb_build_object(
             'verb', fe.verb,
             'meta', fe.meta,
             'visibility', fe.visibility,
             'target_kind', fe.target_kind,
             'target_id', fe.target_id
           ) as preview
      from public.social_feed_entries fe
     where fe.actor_id = p_user_id
    union all
    select 'comment' as kind, sc.id as target_id, sc.created_at,
           sc.removed_at,
           jsonb_build_object(
             'body', sc.body,
             'deleted_at', sc.deleted_at,
             'target_kind', sc.target_kind,
             'target_id', sc.target_id,
             'parent_id', sc.parent_id
           ) as preview
      from public.social_comments sc
     where sc.user_id = p_user_id
    union all
    select 'sheet' as kind, rs.id as target_id, rs.updated_at as created_at,
           rs.removed_at,
           jsonb_build_object(
             'is_public', rs.is_public,
             'updated_at', rs.updated_at,
             'book_isbn', ub.book_isbn,
             'content_excerpt', left(coalesce(rs.content::text, ''), 200)
           ) as preview
      from public.reading_sheets rs
      join public.user_books ub on ub.id = rs.user_book_id
     where ub.user_id = p_user_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'kind', kind,
    'target_id', target_id,
    'created_at', created_at,
    'removed_at', removed_at,
    'preview', preview
  ) order by created_at desc), '[]'::jsonb)
    into v
    from (
      select * from unioned
      order by created_at desc
      limit greatest(1, least(p_limit, 100))
    ) sub;
  return v;
end;
$$;

grant execute on function public.admin_user_recent_content(uuid, int) to authenticated;

-- 7.3 Stats reporter (fiabilité) en batch.
create or replace function public.admin_reporter_stats(p_reporter_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  perform public._assert_admin();
  select coalesce(jsonb_object_agg(reporter_id, stats), '{}'::jsonb)
    into v
    from (
      select
        reporter_id,
        jsonb_build_object(
          'total',     count(*),
          'pending',   count(*) filter (where status = 'pending'),
          'reviewed',  count(*) filter (where status = 'reviewed'),
          'actioned',  count(*) filter (where status = 'actioned'),
          'dismissed', count(*) filter (where status = 'dismissed')
        ) as stats
      from public.social_reports
      where reporter_id = any(p_reporter_ids)
      group by reporter_id
    ) sub;
  return v;
end;
$$;

grant execute on function public.admin_reporter_stats(uuid[]) to authenticated;

-- 7.4 Contexte adaptatif autour du contenu signalé.
create or replace function public.admin_content_context(
  p_kind      text,
  p_target_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  perform public._assert_admin();

  if p_kind = 'feed_entry' then
    select jsonb_build_object(
      'entry', to_jsonb(fe),
      'actor', (select jsonb_build_object(
                  'username', p.username,
                  'display_name', p.display_name,
                  'avatar_url', p.avatar_url
                ) from public.profiles p where p.id = fe.actor_id),
      'comments', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', sc.id,
          'user_id', sc.user_id,
          'username', pp.username,
          'body', sc.body,
          'created_at', sc.created_at,
          'deleted_at', sc.deleted_at,
          'removed_at', sc.removed_at,
          'parent_id', sc.parent_id
        ) order by sc.created_at)
        from public.social_comments sc
        left join public.profiles pp on pp.id = sc.user_id
        where sc.target_kind = 'feed_entry' and sc.target_id = fe.id
      ), '[]'::jsonb),
      'target_content', case fe.target_kind
        when 'sheet' then (
          select jsonb_build_object(
            'kind', 'sheet',
            'id', rs.id,
            'is_public', rs.is_public,
            'content_excerpt', left(coalesce(rs.content::text, ''), 500),
            'removed_at', rs.removed_at
          )
          from public.reading_sheets rs
          where rs.id = fe.target_id
        )
        when 'bingo' then (
          select jsonb_build_object(
            'kind', 'bingo',
            'id', b.id,
            'title', b.title,
            'removed_at', b.removed_at
          )
          from public.bingos b
          where b.id = fe.target_id
        )
        when 'feed_entry' then (
          select jsonb_build_object(
            'kind', 'feed_entry',
            'id', fe2.id,
            'verb', fe2.verb,
            'meta', fe2.meta,
            'actor_id', fe2.actor_id,
            'actor_username', (select username from public.profiles where id = fe2.actor_id),
            'created_at', fe2.created_at,
            'removed_at', fe2.removed_at
          )
          from public.social_feed_entries fe2
          where fe2.id = fe.target_id
        )
        else null
      end
    )
      into v
      from public.social_feed_entries fe
     where fe.id = p_target_id;

  elsif p_kind = 'comment' then
    select jsonb_build_object(
      'comment', jsonb_build_object(
        'id', c.id,
        'user_id', c.user_id,
        'username', pc.username,
        'body', c.body,
        'created_at', c.created_at,
        'edited_at', c.edited_at,
        'deleted_at', c.deleted_at,
        'removed_at', c.removed_at,
        'target_kind', c.target_kind,
        'target_id', c.target_id,
        'parent_id', c.parent_id
      ),
      'parent', case c.target_kind
        when 'feed_entry' then (
          select jsonb_build_object(
            'kind', 'feed_entry',
            'id', fe.id,
            'verb', fe.verb,
            'meta', fe.meta,
            'actor_id', fe.actor_id,
            'actor_username', (select username from public.profiles where id = fe.actor_id),
            'created_at', fe.created_at,
            'removed_at', fe.removed_at
          ) from public.social_feed_entries fe where fe.id = c.target_id
        )
        when 'sheet' then (
          select jsonb_build_object(
            'kind', 'sheet',
            'id', rs.id,
            'owner_id', ub.user_id,
            'is_public', rs.is_public,
            'removed_at', rs.removed_at
          ) from public.reading_sheets rs
            join public.user_books ub on ub.id = rs.user_book_id
            where rs.id = c.target_id
        )
        else null
      end,
      'siblings', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', sc.id,
          'user_id', sc.user_id,
          'username', pp.username,
          'body', sc.body,
          'created_at', sc.created_at,
          'parent_id', sc.parent_id,
          'deleted_at', sc.deleted_at,
          'removed_at', sc.removed_at,
          'is_signaled', sc.id = c.id
        ) order by sc.created_at)
        from public.social_comments sc
        left join public.profiles pp on pp.id = sc.user_id
        where sc.target_kind = c.target_kind
          and sc.target_id   = c.target_id
      ), '[]'::jsonb)
    )
      into v
      from public.social_comments c
      left join public.profiles pc on pc.id = c.user_id
     where c.id = p_target_id;

  elsif p_kind = 'sheet' then
    select jsonb_build_object(
      'sheet', jsonb_build_object(
        'id', rs.id,
        'content', rs.content,
        'is_public', rs.is_public,
        'updated_at', rs.updated_at,
        'removed_at', rs.removed_at,
        'owner_id', ub.user_id
      ),
      'book', jsonb_build_object(
        'isbn', b.isbn,
        'title', b.title,
        'authors', b.authors,
        'cover_url', b.cover_url
      )
    )
      into v
      from public.reading_sheets rs
      join public.user_books ub on ub.id = rs.user_book_id
      join public.books b on b.isbn = ub.book_isbn
     where rs.id = p_target_id;

  elsif p_kind = 'bingo' then
    select jsonb_build_object(
      'bingo', jsonb_build_object(
        'id', b.id,
        'title', b.title,
        'grid', b.grid,
        'created_at', b.created_at,
        'removed_at', b.removed_at,
        'owner_id', b.user_id
      )
    )
      into v
      from public.bingos b
     where b.id = p_target_id;

  elsif p_kind = 'user' then
    select jsonb_build_object(
      'profile', jsonb_build_object(
        'id', p.id,
        'username', p.username,
        'display_name', p.display_name,
        'avatar_url', p.avatar_url,
        'created_at', p.created_at,
        'banned_at', p.banned_at,
        'banned_reason', p.banned_reason
      )
    )
      into v
      from public.profiles p
     where p.id = p_target_id;
  end if;

  return coalesce(v, '{}'::jsonb);
end;
$$;

grant execute on function public.admin_content_context(text, uuid) to authenticated;

-- ═══════════════ 8. Patch des RPC SECURITY DEFINER publiques ═══════════════
-- Ces RPC bypassent la RLS ; sans patch, un contenu retiré ou d'un user
-- banni resterait visible via get_feed / list_root_comments / etc. On
-- réplique partout le filtre `removed_at is null and not is_user_banned(...)`.

-- 8.1 get_feed (0051)
create or replace function public.get_feed(
  p_limit int default 30,
  p_before timestamptz default null
)
returns table (
  entry_id           uuid,
  actor_id           uuid,
  actor_username     text,
  actor_display_name text,
  actor_avatar_url   text,
  actor_is_premium   boolean,
  actor_appearance   jsonb,
  actor_badge_keys   text[],
  verb               text,
  target_kind        text,
  target_id          uuid,
  meta               jsonb,
  created_at         timestamptz,
  source             text,
  score              double precision
)
language sql
security definer
set search_path = public
stable
as $$
  with me as (select auth.uid() as uid),
  followees as (
    select followed_id from public.social_follows, me
    where follower_id = me.uid
  ),
  base as (
    select
      e.id,
      e.actor_id,
      e.verb,
      e.target_kind,
      e.target_id,
      e.meta,
      e.created_at,
      case
        when e.actor_id = (select uid from me) then 'self'
        when e.actor_id in (select followed_id from followees) then 'followee'
        else 'discovery'
      end as source
    from public.social_feed_entries e
    where e.created_at > now() - interval '30 days'
      and (p_before is null or e.created_at < p_before)
      and e.removed_at is null
      and not public.is_user_banned(e.actor_id)
      and (
        e.actor_id = (select uid from me)
        or e.visibility = 'public'
        or (
          e.visibility = 'followers'
          and e.actor_id in (select followed_id from followees)
        )
      )
  ),
  scored as (
    select
      b.*,
      power(0.5, extract(epoch from (now() - b.created_at)) / 3600.0 / 48.0)
      *
      case b.source
        when 'self'     then 1.5
        when 'followee' then 1.0
        else                 0.4
      end as score
    from base b
  )
  select
    s.id           as entry_id,
    s.actor_id,
    p.username     as actor_username,
    p.display_name as actor_display_name,
    p.avatar_url   as actor_avatar_url,
    coalesce(p.is_premium, false) as actor_is_premium,
    jsonb_strip_nulls(jsonb_build_object(
      'fontId',         p.preferences->'fontId',
      'colorPrimary',   p.preferences->'colorPrimary',
      'colorSecondary', p.preferences->'colorSecondary',
      'colorBg',        p.preferences->'colorBg',
      'borderId',       p.preferences->'borderId',
      'fondId',         p.preferences->'fondId',
      'fondOpacity',    p.preferences->'fondOpacity',
      'avatarFrameId',  p.preferences->'avatarFrameId'
    )) as actor_appearance,
    coalesce(
      (
        select array_agg(badge_key order by earned_at desc)
        from public.user_badges
        where user_id = s.actor_id
      ),
      array[]::text[]
    ) as actor_badge_keys,
    s.verb,
    s.target_kind,
    s.target_id,
    s.meta,
    s.created_at,
    s.source,
    s.score
  from scored s
  left join public.profiles p on p.id = s.actor_id
  order by s.score desc, s.created_at desc, s.id desc
  limit p_limit;
$$;

-- 8.2 get_feed_entry (0052)
create or replace function public.get_feed_entry(p_entry_id uuid)
returns table (
  entry_id           uuid,
  actor_id           uuid,
  actor_username     text,
  actor_display_name text,
  actor_avatar_url   text,
  actor_is_premium   boolean,
  actor_appearance   jsonb,
  actor_badge_keys   text[],
  verb               text,
  target_kind        text,
  target_id          uuid,
  meta               jsonb,
  created_at         timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  with me as (select auth.uid() as uid)
  select
    e.id,
    e.actor_id,
    p.username,
    p.display_name,
    p.avatar_url,
    coalesce(p.is_premium, false),
    jsonb_strip_nulls(jsonb_build_object(
      'fontId',         p.preferences->'fontId',
      'colorPrimary',   p.preferences->'colorPrimary',
      'colorSecondary', p.preferences->'colorSecondary',
      'colorBg',        p.preferences->'colorBg',
      'borderId',       p.preferences->'borderId',
      'fondId',         p.preferences->'fondId',
      'fondOpacity',    p.preferences->'fondOpacity',
      'avatarFrameId',  p.preferences->'avatarFrameId'
    )),
    coalesce(
      (
        select array_agg(badge_key order by earned_at desc)
        from public.user_badges
        where user_id = e.actor_id
      ),
      array[]::text[]
    ),
    e.verb,
    e.target_kind,
    e.target_id,
    e.meta,
    e.created_at
  from public.social_feed_entries e
  left join public.profiles p on p.id = e.actor_id
  where e.id = p_entry_id
    and e.removed_at is null
    and not public.is_user_banned(e.actor_id)
    and (
      e.actor_id = (select uid from me)
      or e.visibility = 'public'
      or (
        e.visibility = 'followers'
        and exists (
          select 1 from public.social_follows
          where follower_id = (select uid from me)
            and followed_id = e.actor_id
        )
      )
    );
$$;

-- 8.3 list_root_comments (0052)
create or replace function public.list_root_comments(
  p_target_kind text,
  p_target_id   uuid
)
returns table (
  id                 uuid,
  user_id            uuid,
  body               text,
  created_at         timestamptz,
  edited_at          timestamptz,
  deleted_at         timestamptz,
  actor_username     text,
  actor_display_name text,
  actor_avatar_url   text,
  actor_is_premium   boolean,
  actor_appearance   jsonb,
  actor_badge_keys   text[],
  replies_count      integer,
  like_count         integer,
  my_like            boolean,
  is_editable        boolean
)
language sql
security definer
set search_path = public
stable
as $$
  with me as (select auth.uid() as uid)
  select
    c.id,
    c.user_id,
    c.body,
    c.created_at,
    c.edited_at,
    c.deleted_at,
    p.username,
    p.display_name,
    p.avatar_url,
    coalesce(p.is_premium, false),
    jsonb_strip_nulls(jsonb_build_object(
      'fontId',         p.preferences->'fontId',
      'colorPrimary',   p.preferences->'colorPrimary',
      'colorSecondary', p.preferences->'colorSecondary',
      'colorBg',        p.preferences->'colorBg',
      'borderId',       p.preferences->'borderId',
      'fondId',         p.preferences->'fondId',
      'fondOpacity',    p.preferences->'fondOpacity',
      'avatarFrameId',  p.preferences->'avatarFrameId'
    )),
    coalesce(
      (
        select array_agg(badge_key order by earned_at desc)
        from public.user_badges
        where user_id = c.user_id
      ),
      array[]::text[]
    ),
    (
      select count(*)::int
      from public.social_comments rc
      where rc.parent_id = c.id
        and rc.deleted_at is null
        and rc.removed_at is null
    ) as replies_count,
    (
      select count(*)::int
      from public.social_reactions r
      where r.target_kind = 'comment' and r.target_id = c.id
    ) as like_count,
    exists (
      select 1
      from public.social_reactions r, me
      where r.target_kind = 'comment'
        and r.target_id   = c.id
        and r.user_id     = me.uid
    ) as my_like,
    (
      c.user_id = (select uid from me)
      and c.deleted_at is null
      and not exists (
        select 1 from public.social_comments rc
        where rc.parent_id = c.id and rc.deleted_at is null
      )
      and not exists (
        select 1 from public.social_reactions r
        where r.target_kind = 'comment' and r.target_id = c.id
      )
    ) as is_editable
  from public.social_comments c
  left join public.profiles p on p.id = c.user_id
  where c.target_kind = p_target_kind
    and c.target_id   = p_target_id
    and c.parent_id is null
    and c.removed_at is null
    and not public.is_user_banned(c.user_id)
  order by c.created_at asc;
$$;

-- 8.4 list_comment_replies (0052)
create or replace function public.list_comment_replies(
  p_parent_id uuid
)
returns table (
  id                 uuid,
  user_id            uuid,
  parent_id          uuid,
  body               text,
  created_at         timestamptz,
  edited_at          timestamptz,
  deleted_at         timestamptz,
  actor_username     text,
  actor_display_name text,
  actor_avatar_url   text,
  actor_is_premium   boolean,
  actor_appearance   jsonb,
  actor_badge_keys   text[],
  like_count         integer,
  my_like            boolean,
  is_editable        boolean
)
language sql
security definer
set search_path = public
stable
as $$
  with me as (select auth.uid() as uid)
  select
    c.id,
    c.user_id,
    c.parent_id,
    c.body,
    c.created_at,
    c.edited_at,
    c.deleted_at,
    p.username,
    p.display_name,
    p.avatar_url,
    coalesce(p.is_premium, false),
    jsonb_strip_nulls(jsonb_build_object(
      'fontId',         p.preferences->'fontId',
      'colorPrimary',   p.preferences->'colorPrimary',
      'colorSecondary', p.preferences->'colorSecondary',
      'colorBg',        p.preferences->'colorBg',
      'borderId',       p.preferences->'borderId',
      'fondId',         p.preferences->'fondId',
      'fondOpacity',    p.preferences->'fondOpacity',
      'avatarFrameId',  p.preferences->'avatarFrameId'
    )),
    coalesce(
      (
        select array_agg(badge_key order by earned_at desc)
        from public.user_badges
        where user_id = c.user_id
      ),
      array[]::text[]
    ),
    (
      select count(*)::int
      from public.social_reactions r
      where r.target_kind = 'comment' and r.target_id = c.id
    ) as like_count,
    exists (
      select 1
      from public.social_reactions r, me
      where r.target_kind = 'comment'
        and r.target_id   = c.id
        and r.user_id     = me.uid
    ) as my_like,
    (
      c.user_id = (select uid from me)
      and c.deleted_at is null
      and not exists (
        select 1 from public.social_reactions r
        where r.target_kind = 'comment' and r.target_id = c.id
      )
    ) as is_editable
  from public.social_comments c
  left join public.profiles p on p.id = c.user_id
  where c.parent_id = p_parent_id
    and c.removed_at is null
    and not public.is_user_banned(c.user_id)
  order by c.created_at asc;
$$;

-- 8.5 get_public_sheet (0049)
create or replace function public.get_public_sheet(p_sheet_id uuid)
returns table (
  sheet_id      uuid,
  user_book_id  uuid,
  content       jsonb,
  is_public     boolean,
  updated_at    timestamptz,
  owner_id      uuid,
  book_isbn     text,
  book_title    text,
  book_authors  text[],
  book_cover_url text,
  book_pages    integer
)
language sql
security definer
set search_path = public
stable
as $$
  select
    rs.id          as sheet_id,
    rs.user_book_id,
    rs.content,
    rs.is_public,
    rs.updated_at,
    ub.user_id     as owner_id,
    ub.book_isbn,
    b.title        as book_title,
    b.authors      as book_authors,
    b.cover_url    as book_cover_url,
    b.pages        as book_pages
  from public.reading_sheets rs
  join public.user_books     ub on ub.id = rs.user_book_id
  join public.books          b  on b.isbn = ub.book_isbn
  where rs.id = p_sheet_id
    and rs.removed_at is null
    and not public.is_user_banned(ub.user_id)
    and (rs.is_public = true or ub.user_id = auth.uid());
$$;

-- 8.6 list_public_sheets_for_book (0049)
create or replace function public.list_public_sheets_for_book(p_isbn text)
returns table (
  sheet_id      uuid,
  owner_id      uuid,
  updated_at    timestamptz,
  book_isbn     text,
  book_title    text,
  book_cover_url text,
  book_authors  text[],
  appearance    jsonb
)
language sql
security definer
set search_path = public
stable
as $$
  select
    rs.id        as sheet_id,
    ub.user_id   as owner_id,
    rs.updated_at,
    ub.book_isbn,
    b.title      as book_title,
    b.cover_url  as book_cover_url,
    b.authors    as book_authors,
    rs.content->'appearance' as appearance
  from public.reading_sheets rs
  join public.user_books     ub on ub.id = rs.user_book_id
  join public.books          b  on b.isbn = ub.book_isbn
  where ub.book_isbn = p_isbn
    and rs.is_public = true
    and rs.removed_at is null
    and not public.is_user_banned(ub.user_id)
  order by rs.updated_at desc;
$$;

-- 8.7 list_public_sheets_by_user (0050)
create or replace function public.list_public_sheets_by_user(p_user_id uuid)
returns table (
  sheet_id      uuid,
  owner_id      uuid,
  updated_at    timestamptz,
  book_isbn     text,
  book_title    text,
  book_cover_url text,
  book_authors  text[],
  appearance    jsonb
)
language sql
security definer
set search_path = public
stable
as $$
  select
    rs.id        as sheet_id,
    ub.user_id   as owner_id,
    rs.updated_at,
    ub.book_isbn,
    b.title      as book_title,
    b.cover_url  as book_cover_url,
    b.authors    as book_authors,
    rs.content->'appearance' as appearance
  from public.reading_sheets rs
  join public.user_books     ub on ub.id = rs.user_book_id
  join public.books          b  on b.isbn = ub.book_isbn
  where ub.user_id = p_user_id
    and rs.is_public = true
    and rs.removed_at is null
    and not public.is_user_banned(ub.user_id)
  order by rs.updated_at desc;
$$;
