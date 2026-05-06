-- 0053 — RPCs pour book_reviews.
--
-- Trois fonctions :
--   - get_book_reviews(p_book_isbn)   : agrégats + liste des avis avec commentaire
--   - publish_review_to_feed(p_review_id, p_post_text)
--                                     : émission explicite d'un feed_entry
--                                       'posted_review' (one-shot, "Non merci"
--                                       = ne pas appeler)
--   - vote_book_review(p_review_id, p_value)
--                                     : upsert (-1 | 1) — flip = changement
--   - unvote_book_review(p_review_id) : delete du vote
--
-- get_book_reviews retourne un payload JSON unique pour limiter les
-- round-trips :
--   {
--     avg          : float | null,
--     total        : int,
--     distribution : { '1':n, '2':n, '3':n, '4':n, '5':n },
--     reviews      : [ … reviews avec commentaire, score agrégé, profil … ]
--   }

-- ---------------------------------------------------------------------------
-- Lecture : avg + distribution + liste des avis avec commentaire (enrichis
-- du profil snapshot et du score agrégé des votes).
--
-- Le filtre `comment is not null and length(trim(comment)) > 0` est volontaire
-- (cf. spec : "on affiche tous les avis qui contiennent un commentaire").
-- Les avis sans commentaire alimentent la distribution mais pas la liste.
--
-- SECURITY DEFINER : on lit auth.users → profiles, et on bypass les RLS de
-- profiles (la whitelist de colonnes est alignée sur get_public_profiles
-- cf. 0048).
-- ---------------------------------------------------------------------------
create or replace function public.get_book_reviews(p_book_isbn text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  with review_rows as (
    select id, rating
    from public.book_reviews
    where book_isbn = p_book_isbn
  ),
  vote_agg as (
    select v.review_id, coalesce(sum(v.value), 0)::int as score
    from public.book_reviews_votes v
    where v.review_id in (select id from review_rows)
    group by v.review_id
  ),
  with_comment as (
    select
      r.id,
      r.user_id,
      r.rating,
      r.comment,
      r.created_at,
      r.updated_at,
      coalesce(va.score, 0) as score
    from public.book_reviews r
    left join vote_agg va on va.review_id = r.id
    where r.book_isbn = p_book_isbn
      and r.comment is not null
      and length(trim(r.comment)) > 0
  ),
  reviews_payload as (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id',         w.id,
        'user_id',    w.user_id,
        'book_isbn',  p_book_isbn,
        'rating',     w.rating,
        'comment',    w.comment,
        'created_at', w.created_at,
        'updated_at', w.updated_at,
        'score',      w.score,
        'author', jsonb_build_object(
          'id',           w.user_id,
          'username',     p.username,
          'display_name', p.display_name,
          'avatar_url',   p.avatar_url,
          'is_premium',   coalesce(p.is_premium, false),
          'appearance', jsonb_strip_nulls(jsonb_build_object(
            'fontId',         p.preferences->'fontId',
            'colorPrimary',   p.preferences->'colorPrimary',
            'colorSecondary', p.preferences->'colorSecondary',
            'colorBg',        p.preferences->'colorBg',
            'borderId',       p.preferences->'borderId',
            'fondId',         p.preferences->'fondId',
            'fondOpacity',    p.preferences->'fondOpacity',
            'avatarFrameId',  p.preferences->'avatarFrameId'
          ))
        )
      )
      order by w.score desc, w.created_at desc, w.id desc
    ), '[]'::jsonb) as reviews
    from with_comment w
    left join public.profiles p on p.id = w.user_id
  ),
  stats as (
    select
      avg(rating)::float as avg_rating,
      count(*)::int      as total,
      count(*) filter (where rating = 1)::int as c1,
      count(*) filter (where rating = 2)::int as c2,
      count(*) filter (where rating = 3)::int as c3,
      count(*) filter (where rating = 4)::int as c4,
      count(*) filter (where rating = 5)::int as c5
    from review_rows
  )
  select jsonb_build_object(
    'avg',   case when stats.total = 0 then null else stats.avg_rating end,
    'total', stats.total,
    'distribution', jsonb_build_object(
      '1', stats.c1,
      '2', stats.c2,
      '3', stats.c3,
      '4', stats.c4,
      '5', stats.c5
    ),
    'reviews', (select reviews from reviews_payload)
  )
  from stats;
$$;

grant execute on function public.get_book_reviews(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Publication explicite au feed. Crée un social_feed_entries one-shot.
-- Idempotent : si l'avis a déjà été partagé (entry existante avec
-- target_kind='review' / target_id=review.id), on no-op.
--
-- meta : { book_isbn, rating, post_text } — le post_text vit ici, pas dans
-- book_reviews (séparation entre l'artefact durable attaché au livre et
-- le contenu social éphémère).
-- ---------------------------------------------------------------------------
create or replace function public.publish_review_to_feed(
  p_review_id uuid,
  p_post_text text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id   uuid;
  v_book_isbn text;
  v_rating    smallint;
  v_entry_id  uuid;
begin
  select user_id, book_isbn, rating
    into v_user_id, v_book_isbn, v_rating
  from public.book_reviews
  where id = p_review_id;

  if v_user_id is null then
    raise exception 'review % not found', p_review_id;
  end if;

  if v_user_id <> auth.uid() then
    raise exception 'forbidden';
  end if;

  -- Idempotent : si déjà partagé, on retourne l'entry_id existant.
  select id into v_entry_id
  from public.social_feed_entries
  where actor_id = v_user_id
    and verb = 'posted_review'
    and target_kind = 'review'
    and target_id = p_review_id
  limit 1;

  if v_entry_id is not null then
    return v_entry_id;
  end if;

  insert into public.social_feed_entries
    (actor_id, verb, target_kind, target_id, meta, visibility)
  values (
    v_user_id,
    'posted_review',
    'review',
    p_review_id,
    jsonb_strip_nulls(jsonb_build_object(
      'book_isbn', v_book_isbn,
      'rating',    v_rating,
      'post_text', nullif(trim(coalesce(p_post_text, '')), '')
    )),
    'public'
  )
  returning id into v_entry_id;

  return v_entry_id;
end;
$$;

grant execute on function public.publish_review_to_feed(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Vote (upvote / downvote). Upsert : flip de valeur sur conflit (review, user).
-- ---------------------------------------------------------------------------
create or replace function public.vote_book_review(
  p_review_id uuid,
  p_value smallint
)
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

  if p_value not in (-1, 1) then
    raise exception 'invalid vote value: %', p_value;
  end if;

  insert into public.book_reviews_votes (review_id, user_id, value)
  values (p_review_id, v_user_id, p_value)
  on conflict (review_id, user_id)
  do update set value = excluded.value, created_at = now();
end;
$$;

grant execute on function public.vote_book_review(uuid, smallint) to authenticated;

-- ---------------------------------------------------------------------------
-- Retrait du vote (toggle off).
-- ---------------------------------------------------------------------------
create or replace function public.unvote_book_review(p_review_id uuid)
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

  delete from public.book_reviews_votes
  where review_id = p_review_id and user_id = v_user_id;
end;
$$;

grant execute on function public.unvote_book_review(uuid) to authenticated;
