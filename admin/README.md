# grimolia — admin (local)

Backoffice React (Vite) pour piloter `public.badge_catalog` :
list / create / edit / retire des badges, upload de SVG, preview.

Local-only pour l'instant. Pas de déploiement public.

## Setup

```bash
cd admin
cp .env.example .env
# remplir VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY
pnpm install
pnpm dev
```

Ouvre [http://127.0.0.1:5173](http://127.0.0.1:5173).

## Auth

Code OTP par email (mêmes règles que l'app : pas de mot de passe). Saisis ton
email, reçois un code 6 chiffres, colle-le pour finaliser. Le compte doit avoir
`profiles.is_admin = true` (activé manuellement en SQL côté Supabase Studio) :

```sql
update profiles set is_admin = true where id = 'UUID_USER';
```

Le template email Supabase doit afficher `{{ .Token }}` (pas seulement le lien).

## Sécurité

- Toute écriture passe par l'Edge Function `validate-badge-graphic` qui sanitize le SVG
  avant que le client n'upsert dans `badge_catalog`.
- L'Edge Function vérifie le JWT + `profiles.is_admin`.
- Les RLS sur `badge_catalog` exigent aussi `is_admin`. Double rempart.
