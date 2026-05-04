# Premium / Abonnements

Suivi du chantier "Grimolia Premium" — abonnement in-app mensuel à 2 €, iOS + Android, provider [RevenueCat](https://www.revenuecat.com/). Ticket source : [ClickUp 869d3c5xg](https://app.clickup.com/t/869d3c5xg).

Le rollout est découpé en 3 phases. Phases 1 & 2 mergées sur `main`, phase 3 en attente d'inscription Apple Developer Program + Google Play Console.

## Modèle de données

Migration : `supabase/migrations/0041_premium_availability.sql`.

Catalogues perso (`border_catalog`, `fond_catalog`, `sticker_catalog`, `avatar_frame_catalog`) ont une colonne `availability` (`enum catalog_availability`) qui remplace l'ancien `is_default boolean`. Quatre modes :

| Mode | Visibilité côté app | Tap sur l'item |
|---|---|---|
| `everyone` | toujours visible | sélectionne |
| `premium` | visible avec étoile bottom-left | paywall si non-abonné, sélection sinon |
| `badge` | visible **uniquement** si débloqué via `user_<asset>` | sélectionne |
| `unit` | visible **uniquement** si débloqué via `user_<asset>` | sélectionne |

`badge` et `unit` partagent le même lifecycle frontend : la row d'unlock dans `user_borders` / `user_fonds` / `user_stickers` / `user_avatar_frames` détermine la visibilité. La règle d'octroi est gérée serveur (via badge gagné, ou règle business pour `unit` — pas de paywall).

`unlock_badge_key` (FK `badge_catalog.badge_key`) est posée sur les rows `availability='badge'` pour formaliser le badge déclencheur. Le wiring badge gagné → insert `user_<asset>` n'est pas encore branché (TODO).

État premium d'un user :
- `profiles.is_premium boolean` — source de vérité serveur, écrite par le webhook RevenueCat (phase 3).
- `profiles.premium_until timestamptz` — expiration de l'abonnement courant.

Limites freemium :
- `freemium_settings` (singleton, id = 1) : `max_sheets` (default 25), `max_active_bingos` (default 1). Éditable depuis l'admin.

## Phase 1 — DB + admin ✅

Commit : `e6644ea`.

**DB** (`supabase/migrations/0041_premium_availability.sql`)
- Enum `catalog_availability` + colonnes `availability` / `unlock_badge_key` sur les 4 catalogues, drop `is_default` (backfill `true` → `everyone`, `false` → `badge`).
- `profiles.is_premium` + `premium_until`.
- Table `freemium_settings` singleton + RLS (read public, write admin).

**Admin** (`admin/src/`)
- `lib/types.ts` : `CatalogAvailability`, `FreemiumSettingsRow`.
- `components/decoration-fields/visibility-fieldset.tsx` : radio à 4 options ("À l'unité" disabled — placeholder UI).
- `components/decoration-fields/availability-badge.tsx` : pastille DISPO / PREMIUM / BADGE / UNITÉ dans les listes.
- 4 forms (`border-form`, `fond-form`, `sticker-form`, `avatar-frame-form`) + 4 lists wired sur le selecteur / pastille.
- Section "Abonnements" → sous-onglet "Freemium" éditant `freemium_settings`.

## Phase 2 — App wiring ✅

Commit : `88c5421`.

**Stores** (`store/`)
- `premium.ts` : lit `profiles.is_premium` + `premium_until` au boot et à chaque session change. Pas de subscription temps réel — un fetch suffit, RC va le pousser via webhook plus tard.
- `freemium.ts` : lit `freemium_settings` au boot. Defaults `25 / 1` tant que pas chargé.
- 4 catalog stores (`border-catalog`, `fond-catalog`, `sticker-catalog`, `avatar-frame-catalog`) refactorisés : conservent les rows + `availability` en interne, exposent `useAllBorders/Fonds/Stickers/AvatarFrames` qui injectent `lockReason` + `locked` contre `usePremium`. `badge` / `unit` filtrés à la source si pas dans `user_<asset>`.

**UI partagée** (`components/`)
- `premium-paywall-modal.tsx` : modale partagée, CTA disabled "Bientôt disponible — 2 € / mois", reason `'premium' | 'feature_limit'` + sub-feature `'sheets' | 'bingos'`.
- `lock-overlay.tsx` : étoile bottom-left posée en absolu sur les tiles dont `def.lockReason` est set.

**Pickers wired**
- `personalization-sheet.tsx` (BordersRow / FondsRow), `sheet-customizer.tsx` (BorderTile / FondTile, exportés et réutilisés par bingo-customizer), `bingo-customizer.tsx`, `sticker-picker-modal.tsx`, `avatar-frame-picker-modal.tsx`. Chaque picker a son state booléen `paywall` ; tap sur item `def.locked` ouvre la modale au lieu de sélectionner. L'étoile reste visible chez l'abonné (signal "produit premium") via `def.lockReason`.

**Limites** (`hooks/use-freemium-gate.ts`)
- `canCreateSheet()` : `Object.keys(sheets).length < maxSheets` (pas de soft-delete, le compte direct suffit).
- `canCreateBingo()` : `bingos.filter(b => !b.archivedAt).length < maxActiveBingos` ("non terminé" = pas archivé, brouillon ou en cours).
- Wired dans : `app/bingo/index.tsx` (FAB + CTA empty state), `app/sheet/[isbn].tsx` (`handleSaveDraft`, gated quand fiche nouvelle ET draft non-vide).

**Indicateur premium**
- `components/user-profile-card.tsx` : étoile (16 px, `#f59e0b`) à droite du `displayName` quand `usePremium.isPremium`.

**Test sans RevenueCat** : flip `is_premium` via SQL.
```sql
update public.profiles set is_premium = true where id = '<uid>';
```
Le store re-fetch à chaque session change, donc relog ou re-mount du `_layout` suffit.

## Phase 3 — RevenueCat ⏳

**Bloquée par** : inscription Apple Developer Program (99 $/an, requis pour App Store Connect → générer la In-App Purchase Key et créer le produit IAP) et Google Play Console (25 $ one-shot). Sans ces deux comptes, aucun test sandbox possible.

### Pré-requis externes (à faire avant le code)

- [ ] Apple Developer Program enrollment (validation 1-15 jours selon perso/entreprise + DUNS).
- [ ] Google Play Developer Account.
- [ ] Compte RevenueCat avec entitlement `premium` configuré.
- [ ] Produit IAP `grimolia_premium_monthly` (mensuel 2 €) créé côté App Store Connect ET Play Console, puis liés dans RevenueCat.
- [ ] In-App Purchase Key (`.p8` + Key ID + Issuer ID) uploadée dans RC pour StoreKit 2.
- [ ] Clés API RevenueCat (iOS + Android) récupérées.

### Code à écrire

- [ ] `pnpm add react-native-purchases` + plugin Expo (`react-native-purchases` n'a pas de plugin officiel, install standard suffit en dev client). Nécessite **dev client** (Expo Go ne supporte pas) → `eas build --profile development` à relancer.
- [ ] `lib/premium/revenuecat.ts` : `Purchases.configure({ apiKey, appUserID: supabaseUid })` au login, `Purchases.logOut()` au logout. Listener `addCustomerInfoUpdateListener` qui pousse `entitlements.active['premium']` dans `usePremium` pour UX immédiate (avant que le webhook serveur ne mette à jour `profiles.is_premium`).
- [ ] `lib/premium/purchase.ts` : `purchaseMonthly()` qui appelle `Purchases.purchasePackage()` ou `purchaseStoreProduct()` sur le SKU `grimolia_premium_monthly`.
- [ ] `restorePurchases()` (obligation Apple) — bouton dans la modale paywall.
- [ ] Wiring du CTA "S'abonner" dans `components/premium-paywall-modal.tsx` (actuellement disabled). Gérer states loading / success / error.
- [ ] Env vars : `EXPO_PUBLIC_REVENUECAT_IOS_KEY`, `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` (publiques côté RC, ne pas confondre avec la secret API key serveur).
- [ ] Edge Function `supabase/functions/revenuecat-webhook/index.ts` : reçoit les events RC (INITIAL_PURCHASE, RENEWAL, CANCELLATION, EXPIRATION, BILLING_ISSUE). Vérifie `Authorization: Bearer <token>` (token configuré côté RC + stocké en secret Supabase). Update `profiles.is_premium` + `premium_until` via `service_role`.
- [ ] Configuration du webhook côté dashboard RC pour pointer sur `https://<project>.supabase.co/functions/v1/revenuecat-webhook` avec le bearer token.
- [ ] Vérifier bundle id iOS (`com.corentin.grimolia`) / package name Android cohérents entre RC ↔ `app.config.ts` ↔ App Store Connect ↔ Play Console.

### Defense-in-depth (post-phase 3, optionnel)

- [ ] RPC server-side `create_sheet_or_check_limit` / `create_bingo_or_check_limit` ou triggers DB sur insert qui refusent si user non-premium et au-delà de `freemium_settings`. Pour l'instant l'enforcement est uniquement client (acceptable pour un MVP, mais un user motivé peut bypasser via direct API call).
- [ ] Trigger / Edge Function qui insère dans `user_<asset>` quand un badge avec `unlock_badge_key` correspondant est gagné (formalise le wiring badge → unlock catalog item).

## Notes & décisions

- **`lockReason` = catégorie visuelle, `locked` = gating.** Les deux champs sont indépendants : un item premium chez un abonné garde son `lockReason='premium'` (pour afficher l'étoile) mais perd son `locked`. Évite un flag `premium` séparé.
- **`unit` n'ouvre jamais la paywall.** C'est une catégorie d'octroi à l'unité gérée serveur (insert `user_<asset>` selon une règle business à définir). Tant qu'un user n'a pas l'unlock, l'item n'est même pas exposé. Phase 1 réservait l'option dans le selecteur admin, phase 2 a aligné le frontend sur ce modèle.
- **Soft-delete sur `reading_sheets` non implémenté.** Pas critique pour `max_sheets` (le `removeSheet` du store purge la row, le compte direct est correct). Si soft-delete arrive un jour, ajouter `where deleted_at is null` dans `useFreemiumGate.canCreateSheet`.
- **Source de vérité premium = `profiles.is_premium` serveur.** Le SDK RevenueCat client sert uniquement à l'UX immédiate (paywall, étoile). Tous les enforcements serveur (RPCs, RLS, triggers) doivent lire `profiles.is_premium`. Le webhook RC est le seul écrivain attendu de cette colonne en prod.
