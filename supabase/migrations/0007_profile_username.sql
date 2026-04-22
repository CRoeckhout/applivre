-- 0007 — Username sur les profils.
-- Colonne nullable pendant la transition (users existants n'ont pas encore de
-- username), unique (insensible à la casse) quand non null.
-- Fonction RPC pour vérifier la disponibilité avant de tenter l'update.

alter table public.profiles
  add column if not exists username text;

create unique index if not exists profiles_username_lower_unique
  on public.profiles (lower(username))
  where username is not null;

-- SECURITY DEFINER : bypass RLS pour pouvoir consulter TOUS les profils
-- (sans exposer les rows entiers via RLS). Exclut l'utilisateur courant
-- pour qu'il puisse "reconfirmer" son propre username existant.
create or replace function public.is_username_available(candidate text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.profiles
    where lower(username) = lower(trim(candidate))
      and id is distinct from auth.uid()
  );
$$;

grant execute on function public.is_username_available(text) to authenticated;
