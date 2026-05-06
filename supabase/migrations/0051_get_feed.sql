-- 0051 — Feed : pull-based ranked stream.
--
-- Aggrège les entrées de social_feed_entries selon trois pools :
--   - self      : mes propres entrées          (poids 1.5)
--   - followee  : entrées des users que je suis (poids 1.0)
--   - discovery : tout le reste, public uniquement (poids 0.4)
--
-- Score = decay × source_weight, decay = 0.5 ^ (hours_age / 48). Fenêtre
-- glissante = 30 derniers jours. Pagination par created_at exclusif (p_before).
--
-- Visibility répliquée explicitement (SECURITY DEFINER bypasse RLS) :
--   - public    : tous
--   - followers : seulement si je suis l'actor
--   - private   : seulement si je suis l'actor
--
-- Enrichit chaque entrée avec le profil public de l'actor (whitelist alignée
-- sur get_public_profiles, cf. 0048). Le rendu cible (sheet, bingo, livre…)
-- est résolu côté client via le KindAdapter approprié au verb.
--
-- Limite connue de la pagination time-based : un événement plus ancien que
-- le bord de page mais avec un score plus fort que la queue de page peut
-- réapparaître. Acceptable v1, à reconsidérer si le volume monte (passer à
-- un curseur (score, id) snapshoté).

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

grant execute on function public.get_feed(int, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Trigger : émission auto d'une entry shared_sheet quand une fiche bascule
-- en is_public = true. On émet sur :
--   - INSERT avec is_public = true (création directe en mode publique)
--   - UPDATE qui passe is_public de NOT TRUE → true (publication explicite)
-- Pas d'émission sur édition de contenu (is_public déjà true), ni sur
-- privatisation (is_public passe à false).
--
-- Re-publier une fiche (public → privé → public) ré-émet une nouvelle entry,
-- ce qui correspond au comportement attendu (c'est un nouvel acte de partage).
-- ---------------------------------------------------------------------------
create or replace function public.emit_shared_sheet_on_publish()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id  uuid;
  v_book_isbn text;
begin
  if NEW.is_public is not true then
    return NEW;
  end if;
  if TG_OP = 'UPDATE' and OLD.is_public is true then
    return NEW;
  end if;

  select ub.user_id, ub.book_isbn
    into v_owner_id, v_book_isbn
  from public.user_books ub
  where ub.id = NEW.user_book_id;

  if v_owner_id is null then
    return NEW;
  end if;

  insert into public.social_feed_entries
    (actor_id, verb, target_kind, target_id, meta, visibility, created_at)
  values
    (v_owner_id,
     'shared_sheet',
     'sheet',
     NEW.id,
     jsonb_build_object('book_isbn', v_book_isbn),
     'public',
     now());

  return NEW;
end;
$$;

drop trigger if exists reading_sheets_emit_shared_sheet on public.reading_sheets;
create trigger reading_sheets_emit_shared_sheet
after insert or update on public.reading_sheets
for each row execute function public.emit_shared_sheet_on_publish();

-- ---------------------------------------------------------------------------
-- Backfill : pour chaque sheet déjà publique au moment de la migration, on
-- crée une entry shared_sheet correspondante. Idempotent via where not
-- exists, donc ré-applicable sans risque de doublon. Le trigger n'a pas
-- couvert ces sheets (créées avant son existence).
-- ---------------------------------------------------------------------------
insert into public.social_feed_entries (
  actor_id, verb, target_kind, target_id, meta, visibility, created_at
)
select
  ub.user_id,
  'shared_sheet',
  'sheet',
  rs.id,
  jsonb_build_object('book_isbn', ub.book_isbn),
  'public',
  rs.updated_at
from public.reading_sheets rs
join public.user_books ub on ub.id = rs.user_book_id
where rs.is_public = true
  and not exists (
    select 1
    from public.social_feed_entries fe
    where fe.actor_id    = ub.user_id
      and fe.verb        = 'shared_sheet'
      and fe.target_kind = 'sheet'
      and fe.target_id   = rs.id
  );
