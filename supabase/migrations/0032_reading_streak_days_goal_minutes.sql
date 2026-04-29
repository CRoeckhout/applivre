-- 0032 — Stocke l'objectif quotidien (minutes) au moment de la validation du jour.
-- Permet de garder l'historique de l'exigence même si l'utilisateur change la préférence.
-- Plafonne aussi le champ `dailyReadingGoalMinutes` côté préférences (JSONB) à 24h.

alter table public.reading_streak_days
  add column if not exists goal_minutes integer
    check (goal_minutes is null or (goal_minutes between 1 and 1440));

alter table public.profiles
  drop constraint if exists preferences_daily_goal_max;

alter table public.profiles
  add constraint preferences_daily_goal_max check (
    not (preferences ? 'dailyReadingGoalMinutes')
    or (
      jsonb_typeof(preferences->'dailyReadingGoalMinutes') = 'number'
      and (preferences->>'dailyReadingGoalMinutes')::int between 1 and 1440
    )
  );
