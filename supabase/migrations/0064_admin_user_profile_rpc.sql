-- 0064 — RPC admin_user_profile
-- Régression depuis 0062 : la policy "profiles admin select" a été droppée
-- pour éviter qu'un admin mobile télécharge toute la base, mais le panel
-- admin lit encore `profiles` en direct → RLS "self" renvoie 0 row pour les
-- autres users → "Profil indisponible".
--
-- Cette RPC suit le même pattern que les autres admin_user_* : SECURITY
-- DEFINER + `_assert_admin()` + sélection explicite des colonnes attendues
-- par AdminUserProfile (admin/src/lib/types.ts).

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
    'created_at',     p.created_at
  )
    into v
    from public.profiles p
   where p.id = p_user_id;
  return v;
end;
$$;

grant execute on function public.admin_user_profile(uuid) to authenticated;
