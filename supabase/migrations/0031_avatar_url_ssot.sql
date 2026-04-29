-- Avatar URL : colonne `profiles.avatar_url` devient SSOT.
-- Avant, l'app stockait aussi l'URL dans `preferences->>'avatarUrl'` (JSONB),
-- ce qui causait un drift : storage upload OK mais colonne null côté admin.
-- Ici on rapatrie les valeurs dans la colonne, puis on strip la clé du JSONB.

-- 1. Backfill : colonne null mais clé présente dans le JSONB → recopier.
update public.profiles
set avatar_url = preferences->>'avatarUrl'
where avatar_url is null
  and preferences ? 'avatarUrl'
  and preferences->>'avatarUrl' is not null;

-- 2. Strip la clé `avatarUrl` du JSONB pour éviter toute future divergence.
update public.profiles
set preferences = preferences - 'avatarUrl'
where preferences ? 'avatarUrl';
