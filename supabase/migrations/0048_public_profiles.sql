-- 0048 — Profils publics (réseau social).
--
-- Le package @grimolia/social a besoin de récupérer les colonnes d'identité
-- publiques d'un utilisateur (username, display_name, avatar_url) plus son
-- apparence visuelle publique (cadre photo, fond, bordure, police, couleurs)
-- et ses badges, pour afficher les auteurs de fiches publiques, futurs
-- commentaires, messages, réactions, etc.
--
-- La RLS de public.profiles est self-only (cf. 0001) :
--   `for all using (auth.uid() = id) with check (auth.uid() = id)`.
-- Plutôt que de l'élargir (ce qui exposerait aussi preferences /
-- is_admin / is_premium qu'on veut garder privés), on ajoute une fonction
-- SECURITY DEFINER qui bypass RLS et ne renvoie QUE les colonnes
-- d'identité publiques + une whitelist explicite de l'apparence.
--
-- RÈGLES DURES :
--   - L'email n'est JAMAIS exposé côté public. L'email vit dans auth.users
--     et ne sort de la DB QUE via admin_user_card (cf. 0034) qui gate
--     explicitement sur profiles.is_admin = true.
--   - created_at de profiles n'est PAS exposé : la date de création du
--     compte est considérée comme une donnée sensible (permet de profiler
--     l'ancienneté du user / fingerprinting léger).
--   - Whitelist stricte côté appearance : autres clés de preferences
--     (dailyReadingGoalMinutes, homeCardOrder, customThemes…) restent
--     privées.
--
-- Badges : la table user_badges a une RLS self-only mais SECURITY DEFINER
-- bypass cela. Considéré comme info publique (achievement showcase).

create or replace function public.get_public_profiles(p_user_ids uuid[])
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  appearance jsonb,
  badge_keys text[]
)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.id,
    p.username,
    p.display_name,
    p.avatar_url,
    jsonb_strip_nulls(jsonb_build_object(
      'fontId',         p.preferences->'fontId',
      'colorPrimary',   p.preferences->'colorPrimary',
      'colorSecondary', p.preferences->'colorSecondary',
      'colorBg',        p.preferences->'colorBg',
      'borderId',       p.preferences->'borderId',
      'fondId',         p.preferences->'fondId',
      'fondOpacity',    p.preferences->'fondOpacity',
      'avatarFrameId',  p.preferences->'avatarFrameId'
    )) as appearance,
    coalesce(
      (
        select array_agg(badge_key order by earned_at desc)
        from public.user_badges
        where user_id = p.id
      ),
      array[]::text[]
    ) as badge_keys
  from public.profiles p
  where p.id = any(p_user_ids);
$$;

grant execute on function public.get_public_profiles(uuid[]) to authenticated;
