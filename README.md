# Applivre

Un bullet journal pour livres — suivi de lecture, scan ISBN, prêts nommés, bingo perso, défis.

## Stack

- **Expo SDK 54** + **Expo Router** (iOS, Android, web — un seul codebase)
- **NativeWind v4** (Tailwind pour React Native)
- **react-native-reanimated v4** (animations)
- **Supabase** (auth + Postgres + storage)
- **TanStack Query** + **Zustand**
- **Open Library API** (métadonnées livres, gratuit)

## Démarrer

```bash
pnpm install
cp .env.example .env         # remplir URL + clé Supabase
pnpm start                   # menu interactif Expo
```

### Tester en web

```bash
pnpm web
```

### Tester en iOS

**Sans Xcode** : installer *Expo Go* sur ton iPhone, lancer `pnpm start`, scanner le QR code.

**Avec Xcode** (simulateur) : installer Xcode depuis l'App Store, puis :

```bash
pnpm ios
```

### Tester en Android

**Sans Android Studio** : installer *Expo Go* sur Android, scanner le QR code.

**Avec émulateur** : installer Android Studio + un device virtuel, puis `pnpm android`.

## Backend Supabase

1. Créer un projet gratuit sur https://supabase.com
2. Copier l'URL et la clé anon dans `.env`
3. Appliquer le schéma : ouvrir l'éditeur SQL Supabase et coller le contenu de `supabase/migrations/0001_initial.sql`

## Structure

```
app/                        routes Expo Router
  (tabs)/
    index.tsx               Ma bibliothèque
    scanner.tsx             Scanner ISBN
    profile.tsx             Profil / stats / défis
lib/
  supabase.ts               client Supabase
  openlibrary.ts            wrapper API livres
store/                      slices Zustand
types/                      types partagés
supabase/migrations/        schéma SQL versionné
```

## Roadmap MVP

- [x] Scaffold Expo + NativeWind + Supabase
- [ ] Auth (email magique)
- [ ] Scan ISBN → récupération métadonnées Open Library
- [ ] Ajout livre dans la biblio avec statut
- [ ] Timer de lecture + historique sessions
- [ ] Prêts nommés
- [ ] Fiche de lecture perso
- [ ] Bingo personnalisable
- [ ] Défi annuel
- [ ] V2 : communauté, amis, reviews publiques
