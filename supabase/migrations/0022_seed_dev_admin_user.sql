-- 0022 — Seed dev admin user (local-only convenience)
-- Permet de retrouver le compte admin local après `db reset` sans devoir
-- ressigner et redéfinir is_admin manuellement. Le hash bcrypt provient
-- de la DB locale ; ne JAMAIS commiter ce fichier vers une DB partagée
-- ou la prod (la migration ne devrait pas y exister à terme — la garde
-- est l'absence de ce fichier dans les deploys distants).
--
-- Mot de passe : inchangé depuis le signup local. Si tu veux le changer,
-- recalcule le hash via `crypt('newpass', gen_salt('bf'))` et remplace.

do $$
declare
  uid uuid := '53bbc68f-db9b-4ee4-a720-4f4a089ee273';
  user_email text := 'corentin@thilun.ovh';
  pwd_hash text := '$2a$10$70bCKaxNoSvhzd5sx3liTeRvey6fr98FbzSMz3ZlLzYqHTV/kpCce';
begin
  -- ═════════ auth.users ═════════
  insert into auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, aud, role, is_anonymous, is_sso_user,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    uid,
    '00000000-0000-0000-0000-000000000000',
    user_email,
    pwd_hash,
    now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object(
      'sub', uid::text,
      'email', user_email,
      'email_verified', true,
      'phone_verified', false
    ),
    'authenticated',
    'authenticated',
    false,
    false,
    now(),
    now(),
    '', '', '', ''
  )
  on conflict (id) do nothing;

  -- ═════════ auth.identities ═════════
  -- Colonne `email` est générée à partir de identity_data, on l'omet.
  insert into auth.identities (
    id, user_id, provider, provider_id, identity_data,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(),
    uid,
    'email',
    uid::text,
    jsonb_build_object(
      'sub', uid::text,
      'email', user_email,
      'email_verified', false,
      'phone_verified', false
    ),
    now(), now(), now()
  )
  on conflict (provider, provider_id) do nothing;

  -- ═════════ public.profiles ═════════
  insert into public.profiles (id, username, is_admin, preferences)
  values (
    uid,
    'thilun',
    true,
    '{"fontId":"dm-sans","colorBg":"#f9046f","themeId":"papier","borderId":"example","avatarUrl":null,"colorPrimary":"#c27b52","customThemes":[],"homeCardOrder":["library","sheets","defi"],"colorSecondary":"#1a1410","dailyReadingGoalMinutes":10}'::jsonb
  )
  on conflict (id) do update set
    username = excluded.username,
    is_admin = excluded.is_admin,
    preferences = excluded.preferences;
end$$;
