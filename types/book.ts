export type ReadingStatus = 'wishlist' | 'to_read' | 'reading' | 'paused' | 'read' | 'abandoned';

export type BookSource = 'isbndb' | 'openlibrary' | 'googlebooks' | 'bnf' | 'manual';

export type Book = {
  isbn: string;
  title: string;
  authors: string[];
  pages?: number;
  publishedAt?: string;
  coverUrl?: string;
  source?: BookSource;
  categories?: string[];
};

export type UserBook = {
  id: string;
  userId: string;
  book: Book;
  status: ReadingStatus;
  rating?: number;
  favorite: boolean;
  startedAt?: string;
  finishedAt?: string;
  // Override utilisateur des genres. Array vide ou absent → fallback book.categories.
  genres?: string[];
  addedAt?: string;
  // Snapshot de pause : page atteinte + récap libre saisis dans la modale Pause.
  // Effacés lors du retour en `reading` ou de la clôture du cycle.
  pausedPage?: number;
  pausedSummary?: string;
};

export type ReadCycleOutcome = 'read' | 'abandoned';

// Une "lecture" (première lecture ou relecture). Les sessions sont
// rattachées à un cycle — fermer le cycle isole les stats de la lecture
// suivante sans perdre l'historique.
export type ReadCycle = {
  id: string;
  userBookId: string;
  index: number; // 1-based
  startedAt: string;
  finishedAt?: string;
  finalPage?: number;
  outcome?: ReadCycleOutcome;
};

export type ReadingSession = {
  id: string;
  userBookId: string;
  cycleId: string;
  durationSec: number;
  stoppedAtPage: number;
  startedAt: string;
};

export type BookLoan = {
  id: string;
  userBookId: string;
  contactName: string;
  direction: 'lent' | 'borrowed';
  dateOut: string;
  dateBack?: string;
  note?: string;
};

export type RatingIconKind = 'star' | 'heart' | 'chili';

export type SectionRating = {
  value: number;
  icon: RatingIconKind;
};

export type SheetSection = {
  id: string;
  title: string;
  body: string;
  rating?: SectionRating;
  // Icône custom de la catégorie (copiée depuis le template au moment de
  // l'ajout). Affichée à gauche du titre dans la fiche.
  materialIcon?: string;
  materialIconColor?: string;
  emoji?: string;
};

export const SHEET_BORDER_STYLES = ['none', 'solid', 'dashed', 'dotted', 'double'] as const;
export type SheetBorderStyle = (typeof SHEET_BORDER_STYLES)[number];

export type SheetFrame = {
  // Sélection du cadre. `undefined` ou `'perso'` ⇒ rendu CSS legacy via les
  // champs (style/width/color/radius). Toute autre valeur ⇒ id d'une row du
  // border_catalog appliquée via CardFrame ; les champs CSS sont alors
  // ignorés (épaisseur/arrondi/couleur fixés par le visuel).
  borderId?: string;
  // Color overrides per-fiche pour les cadres SVG. Keys = token names définis
  // dans la row du catalog (ex: `colorPrimary`, `paperWarm`). Prennent
  // priorité sur la chaîne userPrefs → theme à la résolution des SVG.
  colorOverrides?: Record<string, string>;
  // Champs CSS legacy, utilisés uniquement quand `borderId` est absent ou
  // égal à `'perso'`.
  style: SheetBorderStyle;
  width: number;
  color: string;
  radius: number;
};

export type SheetFond = {
  // Sélection du fond. `undefined` ou `'none'` ⇒ pas de fond image, seul
  // `bgColor` est rendu. Toute autre valeur ⇒ id d'une row du fond_catalog
  // rendue (cover/tile) sous le contenu, par-dessus `bgColor`.
  fondId?: string;
  // Color overrides per-instance pour les fonds SVG (mêmes règles que
  // SheetFrame.colorOverrides).
  colorOverrides?: Record<string, string>;
  // Opacité de la couche fond (image), 0..1. `undefined` ⇒ 1 (opaque).
  // N'affecte pas `bgColor` rendu en arrière-plan : seule l'image au-dessus
  // s'estompe, laissant le bg de la fiche transparaître à mesure qu'on baisse.
  opacity?: number;
};

export type SheetRatingIconConfig = {
  kind: RatingIconKind;
  label: string;
  enabled: boolean;
};

export type SheetDefaultCategory = {
  title: string;
  // Icône custom (set fermé `RatingIconKind`). Conservée pour compat ascendante.
  icon?: RatingIconKind;
  // Nom MaterialIcons (set @expo/vector-icons baseline). Priorité sur `icon`.
  materialIcon?: string;
  // Couleur appliquée à `materialIcon`. Hex `#rrggbb`. Si absent → couleur de
  // texte du thème de la fiche.
  materialIconColor?: string;
  // Emoji libre (saisi via clavier). Priorité absolue sur `materialIcon`/`icon`.
  emoji?: string;
};

// Appearance d'une fiche. Toutes les clés sont optionnelles pour un override
// par-fiche ; le template global remplit les valeurs manquantes.
export type SheetAppearance = {
  frame: SheetFrame;
  // Optionnel pour rester ascendant-compatible avec les fiches/grilles
  // persistées avant l'introduction du fond (absent ⇒ pas de fond rendu).
  fond?: SheetFond;
  fontId: string;
  bgColor: string;
  textColor: string;
  mutedColor: string;
  accentColor: string;
  ratingIcons: SheetRatingIconConfig[];
  defaultCategories: SheetDefaultCategory[];
};

export type SheetAppearanceOverride = Partial<SheetAppearance>;

// Sticker placé librement par l'utilisateur sur sa fiche de lecture. Position
// et géométrie sont stockées en relatif (fraction de la fiche / multiplicateur
// de la taille naturelle) — ainsi le placement reste cohérent quelle que soit
// la taille d'écran ou la marge de la fiche au moment du rendu.
//
// L'ordre dans le tableau `ReadingSheet.stickers` détermine le z-order : index
// 0 = arrière du layer, dernier = avant. Tous les stickers sont rendus
// au-dessus du contenu de la fiche (pas de "derrière la fiche").
export type PlacedSticker = {
  // Identifiant unique du placement (un même `stickerId` peut être posé N
  // fois avec des transformations différentes — chaque instance a son propre
  // `id`).
  id: string;
  // Référence dans `sticker_catalog` (synthétisé via `useAllStickers`).
  // Si l'id n'est plus dispo (sticker retiré, plus unlocked), le rendu
  // skip silencieusement — le placement reste persisté pour le cas où le
  // sticker redeviendrait dispo.
  stickerId: string;
  // Position du centre du sticker, en fraction de la fiche : x ∈ [0,1] sur
  // la largeur, y ∈ [0,1] sur la hauteur. Le drag clamp garantit que le
  // centre reste dans [0,1] — l'image peut visuellement déborder mais le
  // sticker reste "ancré" à la fiche.
  x: number;
  y: number;
  // Multiplicateur de la taille naturelle (cf. STICKER_NATURAL_WIDTH_FRACTION
  // dans lib/stickers/catalog). 1 = taille de base, > 1 = agrandi.
  scale: number;
  // Rotation en radians (sens horaire positif).
  rotation: number;
  // Color overrides per-placement pour les SVG (mêmes règles que
  // SheetFrame.colorOverrides / SheetFond.colorOverrides).
  colorOverrides?: Record<string, string>;
};

export type ReadingSheet = {
  userBookId: string;
  sections: SheetSection[];
  updatedAt: string;
  appearance?: SheetAppearanceOverride;
  // Stickers placés sur la fiche. Optionnel pour rester ascendant-compatible
  // avec les fiches persistées avant l'introduction des stickers (absent ⇒
  // pas de stickers rendus). Limite max imposée à l'add via le picker.
  stickers?: PlacedSticker[];
  // Visibilité : true = la fiche est publiable et lisible par tous via la RLS
  // de reading_sheets. Optionnel pour ascendant-compat avec les fiches
  // persistées avant l'introduction du flag (undefined ⇒ traité comme false).
  isPublic?: boolean;
  // UUID assigné par la DB (reading_sheets.id). Présent uniquement après
  // synchronisation (pull ou retour de l'upsert). Sert au routage vers
  // /sheet/view/[id]. Sa présence atteste que la fiche est connue côté
  // serveur — utilisable comme proxy "fiche déjà sync'ée".
  id?: string;
};
