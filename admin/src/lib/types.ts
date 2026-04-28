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

// ═══════════════ Books (catalog public) ═══════════════

export type BookSource = 'openlibrary' | 'googlebooks' | 'bnf' | 'manual';

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
};

export const BOOK_SOURCES: BookSource[] = ['openlibrary', 'googlebooks', 'bnf', 'manual'];
