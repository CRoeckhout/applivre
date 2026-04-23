export type ReadingStatus = 'to_read' | 'reading' | 'read' | 'abandoned';

export type BookSource = 'openlibrary' | 'googlebooks' | 'bnf' | 'manual';

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

export type ReadingSession = {
  id: string;
  userBookId: string;
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
};

export const SHEET_BORDER_STYLES = ['none', 'solid', 'dashed', 'dotted', 'double'] as const;
export type SheetBorderStyle = (typeof SHEET_BORDER_STYLES)[number];

export type SheetFrame = {
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
  icon?: RatingIconKind;
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
