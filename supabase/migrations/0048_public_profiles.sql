-- 0048 — Expose des profils publics pour le réseau social.
--
-- Le package @grimolia/social a besoin de récupérer (username, display_name,
-- avatar_url) pour afficher les auteurs de fiches publiques, de futurs
-- commentaires, messages, réactions, etc.
--
-- La RLS actuelle sur public.profiles est self-only :
--   `for all using (auth.uid() = id) with check (auth.uid() = id)`.
--
-- Plutôt que de l'élargir (ce qui exposerait aussi preferences / is_admin /
-- is_premium qu'on veut garder privés), on ajoute une fonction
-- SECURITY DEFINER qui bypass RLS et ne renvoie QUE les colonnes d'identité
-- publiques. Le client appelle cette fonction via supabase.rpc(...).
--
-- Mêmes garde-fous que `is_username_available` (cf. 0007).

create or replace function public.get_public_profiles(p_user_ids uuid[])
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_url text
)
language sql
security definer
set search_path = public
stable
as $$
  select id, username, display_name, avatar_url
  from public.profiles
  where id = any(p_user_ids);
$$;

grant execute on function public.get_public_profiles(uuid[]) to authenticated;
