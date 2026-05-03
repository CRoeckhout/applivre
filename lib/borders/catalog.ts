import type { ImageSourcePropType } from 'react-native';

export type BorderInsets = { top: number; right: number; bottom: number; left: number };

// Raison pour laquelle un item de catalog est verrouillé côté user. Seul
// `premium` côté front : c'est la seule catégorie qui déclenche un paywall.
// `badge` et `unit` sont gérés serveur (unlock via user_<asset>) — invisibles
// tant que la row d'unlock n'est pas posée, et une fois visibles, sélectionnables
// comme un item ouvert à tous.
export type CatalogLockReason = 'premium';

export type BorderDef = {
  id: string;
  label: string;
  // `source` (PNG) ou `svgXml` (SVG inline) ; au moins l'un des deux pour
  // qu'un cadre soit rendu. Aucun ⇒ passthrough (cadre `none`).
  source?: ImageSourcePropType;
  svgXml?: string;
  imageSize?: { width: number; height: number };
  slice?: BorderInsets;
  padding?: BorderInsets;
  // Distance depuis chaque bord externe vers l'intérieur où démarre le bg
  // coloré dans la cellule du frame. Absent ⇒ default NineSliceFrame (slice/2).
  bgInsets?: BorderInsets;
  // Mode de remplissage des bandes edges/center. `stretch` étire le slice,
  // `round` le tile avec count entier (équivalent CSS border-image-repeat).
  // Absent ⇒ stretch.
  repeat?: 'stretch' | 'round';
  // Tokens de couleur pour SVG : map `name → defaultHex`. Le SVG contient
  // `{{name}}` aux endroits à thémer ; à l'app, `name` est résolu contre le
  // theme courant (slot homonyme), fallback sur defaultHex si pas de match.
  tokens?: Record<string, string>;
  // Padding interne appliqué à la card quand ce cadre est actif. Override
  // les paddings hardcodés (p-5/p-6) des composants cards via context.
  // Absent ou 0 ⇒ contenu collé aux edges intérieurs du frame.
  cardPadding?: number;
  // Catégorie d'accès de l'item. Posée pour tout item non-`everyone` (et
  // sert aussi de marker visuel : le picker affiche l'étoile dès que ce
  // champ est set, indépendamment de `locked`). Absent ⇒ disponible pour
  // tous, pas d'étoile.
  lockReason?: CatalogLockReason;
  // Verrou côté user. `true` ⇒ le tap déclenche la modale paywall au lieu
  // de sélectionner. Indépendant de `lockReason` : un item premium chez un
  // user abonné garde son `lockReason` mais perd son `locked`.
  locked?: boolean;
};

// Catalog local. Sera remplacé par un fetch DB (table `border_catalog`) — pattern
// aligné sur `badge_catalog`. Pour l'instant, seule l'option "aucun cadre" est
// disponible localement ; les cadres réels viennent de la DB une fois le wiring
// app→catalog fait.
export const BORDERS: BorderDef[] = [
  { id: 'none', label: 'Aucun cadre' },
];

// Sentinel id utilisé par les fiches de lecture pour indiquer "rendu CSS
// custom" (style/width/color/radius modifiables) au lieu d'un cadre du
// catalog. Pas une row réelle ; reste hors de `BORDERS`.
export const PERSO_BORDER_ID = 'perso';

// Pas de cadre. Les nouveaux users démarrent ici. Pour utiliser un cadre,
// l'utilisateur doit le sélectionner dans le perso parmi ceux disponibles
// (= cadres `availability = everyone` côté catalog OU cadres unlock via user_borders).
export const DEFAULT_BORDER_ID = 'none';

export function getBorder(id: string): BorderDef {
  return BORDERS.find((b) => b.id === id) ?? BORDERS[0];
}
