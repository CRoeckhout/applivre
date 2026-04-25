# Build & Deploy

Ce document couvre l'environnement de dev local, les variants d'app, et le déploiement du backend Supabase.

## Architecture des environnements

| Environnement | Backend | Bundle ID iOS | Nom affiché | Build |
|---|---|---|---|---|
| **dev local** | Supabase local (Docker) | `com.corentin.applivre.dev` | Applivre Dev | Debug |
| **prod** | Supabase hosted | `com.corentin.applivre` | applivre | Release |

Les deux apps coexistent sur le même device.

## Setup initial (première fois)

### Prérequis
- Docker Desktop installé et lancé
- Xcode (pour iOS) avec un Apple ID configuré
- `npx supabase` disponible

### Cloner et installer
```bash
npm install
```

### Lancer Supabase en local
```bash
npx supabase start
```
Premier run : ~5 min (télécharge ~2 GB d'images Docker). Les runs suivants : quelques secondes.

Les 13 migrations dans `supabase/migrations/` s'appliquent automatiquement. Pour voir les credentials locaux :
```bash
npx supabase status
```

### Fichier d'env local
Créer `.env.development.local` (gitignoré) :
```
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY de `supabase status`>
```

Pour Expo Go sur device réel, remplacer `127.0.0.1` par l'IP LAN du Mac (`ipconfig getifaddr en0`).

## Workflow quotidien

### Développer contre le backend local
```bash
npm start                # Metro dev server → Simulateur ou Expo Go
npm run ios              # Build Debug + lance sur simulateur iOS
npm run android          # Build Debug + lance sur simulateur Android
```

Variables injectées : `APP_VARIANT=development` → l'app est compilée avec le bundle ID `.dev` et le nom "Applivre Dev".

Expo charge `.env.development.local` en priorité → backend Supabase local.

### Builder en Release (backend prod)
```bash
npm run build:ios        # expo run:ios --configuration Release
npm run build:android    # expo run:android --variant release
```

Pas de `APP_VARIANT` → bundle ID prod + Expo ignore `.env.development.local` et lit `.env` → backend Supabase hosted.

### Switcher temporairement : dev contre backend prod
```bash
mv .env.development.local .env.development.local.off
npm start
# puis remettre :
mv .env.development.local.off .env.development.local
```

### Si le build iOS coince après changement de config
```bash
npx expo prebuild --clean
npm run ios
```
`--clean` regénère `ios/` et `android/` depuis `app.config.ts` + les plugins. Safe dans notre setup (tout est déclaratif via plugins et `@bacons/apple-targets`).

## Backend : déploiement

### Appliquer une nouvelle migration

Workflow : écrire la migration en local, tester, puis push vers hosted.

```bash
# 1. Créer un fichier dans supabase/migrations/0014_ma_feature.sql

# 2. Appliquer en local et tester
npx supabase db reset    # drop + re-applique toutes les migrations

# 3. Pusher vers hosted prod
npx supabase db push
```

`db reset` est destructif : il efface la base locale. Pour un ajustement léger :
```bash
npx supabase migration up
```

### Déployer une edge function
```bash
npx supabase functions deploy resolve-book
npx supabase functions deploy search-books
```

### Secrets serveur (Supabase hosted)
```bash
npx supabase secrets set GOOGLE_BOOKS_KEY=xxx
npx supabase secrets list
```

Pour les avoir en local, créer `supabase/functions/.env` (gitignoré) et relancer `supabase start`.

## Gestion des env files Expo

Ordre de priorité (premier trouvé gagne) :

1. `.env.development.local` — override dev local (gitignoré)
2. `.env.local` — override universel (gitignoré)
3. `.env.development` — dev partagé (committable, pas utilisé actuellement)
4. `.env` — defaults (contient les creds Supabase hosted)

En mode Release, `.env.development.local` est ignoré.

Seules les vars préfixées `EXPO_PUBLIC_` sont injectées dans le bundle JS.

## Caveats

- **Apple free tier :** chaque bundle ID a son propre provisioning profile de 7 jours. Les deux apps (dev et prod) doivent être re-signées séparément. Pour un workflow plus confortable, un compte Apple Developer payant lève cette limite.
- **Live Activities :** le widget `ReadingLiveActivity` hérite du bundle ID du parent. Pas d'action manuelle nécessaire.
- **Format des clés Supabase :** le CLI local expose à la fois un JWT legacy (`ANON_KEY`) et le nouveau format (`PUBLISHABLE_KEY` = `sb_publishable_*`). On utilise le JWT legacy — meilleure compat avec les edge functions.
- **Port conflicts :** la stack locale occupe 54321–54324. En cas de conflit, arrêter les autres projets Supabase : `npx supabase stop --project-id <autre>`.

## Passage à EAS (plus tard)

Pas mis en place actuellement. Lorsque pertinent (distribution TestFlight, CI/CD) :

```bash
npm i -D eas-cli
npx eas init
npx eas build --profile production --platform ios
```

`eas.json` définira les profiles et leurs env vars. À envisager quand :
- On veut distribuer via TestFlight sans compiler sur le Mac
- On met en place un CI
- On ajoute des contributeurs
