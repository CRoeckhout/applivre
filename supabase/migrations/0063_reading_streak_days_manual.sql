-- 0063 — Distingue les jours validés manuellement (toggle) des jours validés
-- automatiquement par une session de lecture qui atteint l'objectif quotidien.
-- Permet à l'app et au backoffice de partager la même source de vérité
-- (les rows de reading_streak_days) au lieu de recalculer côté client.
--
-- Existing rows = toggles manuels → default true correct pour le backfill.

alter table public.reading_streak_days
  add column if not exists manual boolean not null default true;

-- Recrée admin_user_challenges pour exposer la colonne `manual` dans la sous-
-- requête `streak_days` (le `select day, goal_minutes, ...` explicite ne la
-- prenait pas).
create or replace function public.admin_user_challenges(p_user_id uuid)
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
    'bingos', coalesce(
      (select jsonb_agg(to_jsonb(bi) order by bi.created_at desc)
         from public.bingos bi
        where bi.user_id = p_user_id),
      '[]'::jsonb
    ),
    'completions', coalesce(
      (select jsonb_agg(to_jsonb(bc))
         from public.bingo_completions bc
         join public.bingos bi on bi.id = bc.bingo_id
        where bi.user_id = p_user_id),
      '[]'::jsonb
    ),
    'streak_days', coalesce(
      (select jsonb_agg(to_jsonb(sd) order by sd.day desc)
         from (
           select day, goal_minutes, manual, created_at, user_id
             from public.reading_streak_days
            where user_id = p_user_id
            order by day desc
            limit 120
         ) sd),
      '[]'::jsonb
    ),
    'annual_challenges', coalesce(
      (select jsonb_agg(to_jsonb(rc) order by rc.year desc)
         from public.reading_challenges rc
        where rc.user_id = p_user_id),
      '[]'::jsonb
    ),
    'read_by_year', coalesce(
      (select jsonb_object_agg(y::text, c)
         from (
           select extract(year from ub.finished_at)::int as y, count(*) as c
             from public.user_books ub
            where ub.user_id = p_user_id
              and ub.status = 'read'
              and ub.finished_at is not null
            group by 1
         ) g),
      '{}'::jsonb
    )
  ) into v;
  return v;
end;
$$;

grant execute on function public.admin_user_challenges(uuid) to authenticated;
