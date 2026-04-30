-- 0034 — RPC admin_user_card
-- Retourne l'identité d'un utilisateur (profil + email) à partir d'un user_id.
-- Réservé aux admins (`profiles.is_admin = true`). SECURITY DEFINER pour
-- pouvoir lire `auth.users.email` malgré la RLS.
--
-- Sert à afficher une fiche utilisateur réutilisable côté admin (livres,
-- défis bingo, etc.) sans dupliquer la logique RPC à chaque section.

create or replace function public.admin_user_card(p_user_id uuid)
returns table (
  user_id uuid,
  email text,
  username text,
  display_name text,
  avatar_url text,
  account_created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_admin = true
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select
    p.id as user_id,
    u.email::text,
    p.username,
    p.display_name,
    p.avatar_url,
    p.created_at as account_created_at
  from public.profiles p
  left join auth.users u on u.id = p.id
  where p.id = p_user_id;
end;
$$;

grant execute on function public.admin_user_card(uuid) to authenticated;
