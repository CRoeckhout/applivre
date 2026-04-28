export type ReadingStatus = 'wishlist' | 'to_read' | 'reading' | 'read' | 'abandoned';

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
  fontId: string;
  bgColor: string;
  textColor: string;
  mutedColor: string;
  accentColor: string;
  ratingIcons: SheetRatingIconConfig[];
  defaultCategories: SheetDefaultCategory[];
};

export type SheetAppearanceOverride = Partial<SheetAppearance>;

export type ReadingSheet = {
  userBookId: string;
  sections: SheetSection[];
  updatedAt: string;
  appearance?: SheetAppearanceOverride;
};
