-- 0071 — Filtre "Que j'ai aimés" sur la galerie de templates.
--
-- Ajoute le param `p_liked_only` à `list_public_templates`. Quand true,
-- restreint aux templates pour lesquels le caller (auth.uid()) a un like
-- dans `reading_sheets_template_likes`.
--
-- Implémenté en EXISTS pour rester compatible avec le sort 'liked' qui
-- order by `likes_count` global (et pas par like du caller).

create or replace function public.list_public_templates(
  p_search          text default null,
  p_genres          text[] default null,
  p_sort            text default 'popular',
  p_include_premium boolean default true,
  p_creator_id      uuid default null,
  p_limit           integer default 30,
  p_offset          integer default 0,
  p_liked_only      boolean default false
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
    and (
      not coalesce(p_liked_only, false)
      or exists (
        select 1 from public.reading_sheets_template_likes l
         where l.template_id = t.id and l.user_id = auth.uid()
      )
    )
  order by
    case when p_sort = 'liked' then t.likes_count end desc nulls last,
    case when p_sort = 'recent' or p_sort = 'popular' then t.updated_at end desc nulls last,
    t.id desc
  limit greatest(coalesce(p_limit, 30), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

grant execute on function public.list_public_templates(text, text[], text, boolean, uuid, integer, integer, boolean) to authenticated;
