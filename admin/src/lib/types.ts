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

// ═══════════════ Catalog availability (cross-cutting) ═══════════════

// Mode d'accès d'un item de catalog perso. `everyone` = visible et utilisable
// par tous. `premium` = visible mais locked si user non-premium (paywall au
// clic). `badge` = caché tant que l'unlock n'a pas eu lieu (table user_<asset>),
// avec `unlock_badge_key` qui formalise le badge déclencheur (wiring à venir).
// `unit` = achat à l'unité, mécanique à définir.
export type CatalogAvailability = 'everyone' | 'premium' | 'badge' | 'unit';

export const CATALOG_AVAILABILITIES: CatalogAvailability[] = [
  'everyone',
  'premium',
  'badge',
  'unit',
];

export const CATALOG_AVAILABILITY_LABELS: Record<CatalogAvailability, string> = {
  everyone: 'Disponible pour tous',
  premium: 'Premium',
  badge: "Obtention d'un badge",
  unit: "À l'unité",
};

// ═══════════════ Borders ═══════════════

export type BorderKind = 'png_9slice' | 'svg_9slice' | 'lottie_9slice';

export type BorderRepeatMode = 'stretch' | 'round';

// Mode de rendu d'une cellule de la grille N-slice. `stretch`/`round`
// étendent les notions 9-slice existantes ; `fixed` = la cellule garde sa
// taille pixel source (comme un coin), pour ancrer un ornement non-déformable.
export type BorderBandMode = 'stretch' | 'round' | 'fixed';

// Configuration N-slice flat : un seul jeu de cuts X et Y produit une grille
// (cutsY+1) × (cutsX+1) de cellules. Chaque cellule a son mode propre. 9-slice
// classique = 2 cuts X + 2 cuts Y donnant 9 cellules. Ajouter un cut crée
// une colonne/row supplémentaire dans la grille.
//
// Cuts en coordonnées source, asc, dans [0, imageWidth] / [0, imageHeight].
// modes[j][i] = mode de la cellule à row j, col i.
// length(modes) = cutsY.length + 1, length(modes[j]) = cutsX.length + 1.
//
// Sizing :
//   - col i a width = source si AU MOINS UNE cellule de la col est fixed,
//     sinon flex proportionnel à sa width source.
//   - row j a height = source si AU MOINS UNE cellule de la row est fixed,
//     sinon flex.
// Permet aux ornements (fixed) d'imposer leur taille source à toute la
// colonne/row, les autres cells s'adaptant visuellement.
export type BorderSliceExtras = {
  cutsX: number[];
  cutsY: number[];
  modes: BorderBandMode[][];
};

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
  // N-slice étendu : 5 zones indépendantes (4 edges + center). null ⇒
  // comportement 9-slice classique avec `repeat_mode` global.
  slice_extras: BorderSliceExtras | null;
  card_padding: number;
  tokens: Record<string, string>;
  availability: CatalogAvailability;
  unlock_badge_key: string | null;
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
  availability: CatalogAvailability;
  unlock_badge_key: string | null;
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
  availability: CatalogAvailability;
  unlock_badge_key: string | null;
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
  availability: CatalogAvailability;
  unlock_badge_key: string | null;
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

export type BingoPillStatus = 'private' | 'proposed' | 'public' | 'disabled';

export const BINGO_PILL_STATUSES: BingoPillStatus[] = [
  'private',
  'proposed',
  'public',
  'disabled',
];

export const BINGO_PILL_STATUS_LABELS: Record<BingoPillStatus, string> = {
  private: 'Privé',
  proposed: 'Proposé',
  public: 'Public',
  disabled: 'Désactivé',
};

export type BingoPillRow = {
  id: string;
  user_id: string;
  label: string;
  status: BingoPillStatus;
  proposal_message: string | null;
  decision_reason: string | null;
  decided_at: string | null;
  decided_by: string | null;
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

// ═══════════════ Music themes (reading session ambient) ═══════════════

// Bibliothèque de musiques d'ambiance jouées pendant les sessions de lecture.
// Feature gatée premium côté app : seuls les abonnés peuvent récupérer les
// pistes via la RPC get_music_theme_tracks. Côté admin, les rows sont gérées
// via RLS admin classique.

export type MusicThemeRow = {
  id: string;
  key: string;
  display_name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

export type MusicThemeTrackRow = {
  id: string;
  theme_id: string;
  title: string;
  storage_path: string;
  sort_order: number;
  is_active: boolean;
  duration_ms: number | null;
  created_at: string;
};

// ═══════════════ Admin users section ═══════════════

// Statuts possibles d'un livre dans l'étagère utilisateur. `wishlist` ajouté
// en 0015, `paused` en 0029. Source : public.reading_status enum.
export type ReadingStatus =
  | 'wishlist'
  | 'to_read'
  | 'reading'
  | 'paused'
  | 'read'
  | 'abandoned';

export const READING_STATUSES: ReadingStatus[] = [
  'wishlist',
  'to_read',
  'reading',
  'paused',
  'read',
  'abandoned',
];

export const READING_STATUS_LABELS: Record<ReadingStatus, string> = {
  wishlist: 'Wishlist',
  to_read: 'À lire',
  reading: 'En cours',
  paused: 'En pause',
  read: 'Lu',
  abandoned: 'Abandonné',
};

// Mirror du return de la RPC admin_users_list (cf. 0059). `total_count` est
// le COUNT(*) OVER () du résultat filtré, dupliqué sur chaque ligne pour
// économiser un round-trip.
export type AdminUserListItem = {
  user_id: string;
  email: string | null;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_premium: boolean;
  is_admin: boolean;
  account_created_at: string;
  last_activity_at: string | null;
  books_count: number;
  sheets_count: number;
  total_count: number;
};

// Whitelist d'apparence stockée dans profiles.preferences (cf. 0048
// get_public_profiles). Toutes les clés sont optionnelles — un user peut
// n'avoir customisé aucun élément. `avatarFrameId = 'none'` signifie
// explicitement "pas de cadre".
export type AdminUserAppearance = {
  fontId?: string;
  colorPrimary?: string;
  colorSecondary?: string;
  colorBg?: string;
  borderId?: string;
  fondId?: string;
  fondOpacity?: number;
  avatarFrameId?: string;
};

// Profile + preferences décodées + flags admin/premium. Lecture admin via
// la policy "profiles admin select" (cf. 0059).
export type AdminUserProfile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_premium: boolean;
  is_admin: boolean;
  premium_until: string | null;
  preferences: Record<string, unknown> | null;
  created_at: string;
};

export type UserBookRow = {
  id: string;
  user_id: string;
  book_isbn: string;
  status: ReadingStatus;
  rating: number | null;
  favorite: boolean;
  started_at: string | null;
  finished_at: string | null;
  paused_page: number | null;
  paused_summary: string | null;
  genres: string[];
  created_at: string;
};

export type ReadingSessionRow = {
  id: string;
  user_book_id: string;
  duration_sec: number;
  // Renommée en 0002 : `pages_read` (delta) → `stopped_at_page` (page
  // absolue à laquelle l'user s'est arrêté). Pour le total cumulé il faut
  // dérouler les cycles (cf. 0010_read_cycles.sql).
  stopped_at_page: number;
  started_at: string;
  cycle_id: string | null;
};

export type LoanDirection = 'lent' | 'borrowed';

export type BookLoanRow = {
  id: string;
  user_book_id: string;
  contact_name: string;
  direction: LoanDirection;
  date_out: string;
  date_back: string | null;
  note: string | null;
};

export type ReadingSheetRow = {
  id: string;
  user_book_id: string;
  content: Record<string, unknown>;
  is_public: boolean;
  updated_at: string;
};

export type BingoRow = {
  id: string;
  user_id: string;
  title: string;
  grid: unknown;
  created_at: string;
};

export type BingoCompletionRow = {
  id: string;
  bingo_id: string;
  cell_index: number;
  user_book_id: string | null;
  completed_at: string;
};

export type ReadingChallengeRow = {
  id: string;
  user_id: string;
  year: number;
  target_count: number;
};

export type ReadingStreakDayRow = {
  user_id: string;
  day: string;
  goal_minutes: number | null;
  manual: boolean;
  created_at: string;
};

export type UserBadgeRow = {
  user_id: string;
  badge_key: string;
  earned_at: string;
};

export type SocialFeedEntryRow = {
  id: string;
  actor_id: string;
  verb: string;
  target_kind: string | null;
  target_id: string | null;
  meta: Record<string, unknown>;
  visibility: 'public' | 'followers' | 'private';
  created_at: string;
};

// ═══════════════ Freemium settings (singleton) ═══════════════

// Limites du plan freemium éditables depuis l'admin (section Abonnements).
// Une seule row attendue (id = 1).
export type FreemiumSettingsRow = {
  id: number;
  max_sheets: number;
  max_active_bingos: number;
  updated_at: string;
  updated_by: string | null;
};

