export type RuleType =
  | 'first_sheet'
  | 'first_bingo'
  | 'sheets_count'
  | 'books_read'
  | 'bingo_completed'
  | 'streak_max';

export type Rule =
  | { type: 'first_sheet' }
  | { type: 'first_bingo' }
  | { type: 'sheets_count'; min: number }
  | { type: 'books_read'; min: number }
  | { type: 'bingo_completed'; min: number }
  | { type: 'streak_max'; min: number };

export type GraphicKind = 'svg' | 'lottie';

export type BadgeCatalogRow = {
  badge_key: string;
  title: string;
  description: string;
  rule: Rule;
  graphic_kind: GraphicKind;
  graphic_payload: string;
  graphic_tokens: Record<string, string>;
  active_from: string | null;
  active_until: string | null;
  retired_at: string | null;
  created_at: string;
  updated_at: string;
};

export const RULE_TYPES_WITH_MIN: RuleType[] = [
  'sheets_count',
  'books_read',
  'bingo_completed',
  'streak_max',
];

// ═══════════════ Borders ═══════════════

export type BorderKind = 'png_9slice' | 'svg_9slice' | 'lottie_9slice';

export type BorderRepeatMode = 'stretch' | 'round';

export type BorderCatalogRow = {
  border_key: string;
  title: string;
  description: string | null;
  kind: BorderKind;
  storage_path: string | null;
  payload: string | null;
  image_width: number;
  image_height: number;
  slice_top: number;
  slice_right: number;
  slice_bottom: number;
  slice_left: number;
  bg_inset_top: number | null;
  bg_inset_right: number | null;
  bg_inset_bottom: number | null;
  bg_inset_left: number | null;
  repeat_mode: BorderRepeatMode;
  card_padding: number;
  tokens: Record<string, string>;
  is_default: boolean;
  active_from: string | null;
  active_until: string | null;
  retired_at: string | null;
  created_at: string;
  updated_at: string;
};

// ═══════════════ Fonds ═══════════════

// Fond rendu cover/tile en arrière-plan des cards/fiches/bingos. Suit la
// même convention de tokens et de lifecycle que les cadres ; n'a pas de
// slice/bg_inset/card_padding (rendering plein cadre, pas 9-slice).

export type FondKind = 'png_9slice' | 'svg_9slice' | 'lottie_9slice';

export type FondRepeatMode = 'cover' | 'tile';

export type FondCatalogRow = {
  fond_key: string;
  title: string;
  description: string | null;
  kind: FondKind;
  storage_path: string | null;
  payload: string | null;
  image_width: number;
  image_height: number;
  repeat_mode: FondRepeatMode;
  tokens: Record<string, string>;
  is_default: boolean;
  active_from: string | null;
  active_until: string | null;
  retired_at: string | null;
  created_at: string;
  updated_at: string;
};

// ═══════════════ Stickers ═══════════════

// Sticker placé librement par l'utilisateur sur une fiche. Plus simple que
// cadres/fonds : pas de slice, pas de mode de remplissage (chaque sticker
// est placé à un (x,y,scale,rotation) arbitraire). Conserve `tokens` SVG
// pour le recolor runtime.

export type StickerKind = 'png' | 'svg';

export type StickerCatalogRow = {
  sticker_key: string;
  title: string;
  description: string | null;
  kind: StickerKind;
  storage_path: string | null;
  payload: string | null;
  image_width: number;
  image_height: number;
  tokens: Record<string, string>;
  is_default: boolean;
  active_from: string | null;
  active_until: string | null;
  retired_at: string | null;
  created_at: string;
  updated_at: string;
};

// ═══════════════ Avatar frames ═══════════════

// Cadre rond appliqué autour de la photo de profil. PNG only en MVP.
// `image_scale` (0..1) règle la taille de la photo dans le cadre ;
// `image_padding` (px en espace natif) ajoute un inset additionnel pour
// fine-tuning. Pas de slice (rendering plein cadre, forme toujours ronde
// imposée côté app via border-radius).

export type AvatarFrameKind = 'png';

export type AvatarFrameCatalogRow = {
  frame_key: string;
  title: string;
  description: string | null;
  kind: AvatarFrameKind;
  storage_path: string | null;
  payload: string | null;
  image_width: number;
  image_height: number;
  image_scale: number;
  image_padding: number;
  tokens: Record<string, string>;
  is_default: boolean;
  active_from: string | null;
  active_until: string | null;
  retired_at: string | null;
  created_at: string;
  updated_at: string;
};

// ═══════════════ Books (catalog public) ═══════════════

export type BookSource = 'isbndb' | 'openlibrary' | 'googlebooks' | 'bnf' | 'manual';

export type BookCatalogRow = {
  isbn: string;
  title: string;
  authors: string[];
  pages: number | null;
  published_at: string | null;
  cover_url: string | null;
  source: BookSource | null;
  categories: string[];
  cached_at: string;
  ai_cleaned_at: string | null;
};

export type AiCleanedBook = {
  title: string;
  authors: string[];
  categories: string[];
  confidence: number;
};

export const BOOK_SOURCES: BookSource[] = ['isbndb', 'openlibrary', 'googlebooks', 'bnf', 'manual'];

// ═══════════════ Bingo pills (user-owned challenges) ═══════════════

export type BingoPillRow = {
  id: string;
  user_id: string;
  label: string;
  created_at: string;
};

// ═══════════════ User card (identité réutilisable côté admin) ═══════════════

export type UserCardData = {
  user_id: string;
  email: string | null;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  account_created_at: string | null;
};

