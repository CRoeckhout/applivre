import type {
  Book,
  BookLoan,
  ReadCycle,
  ReadCycleOutcome,
  ReadingSession,
  PlacedSticker,
  ReadingSheet,
  SheetAppearance,
  SheetAppearanceOverride,
  SheetSection,
  UserBook,
} from '@/types/book';
import type { BadgeCatalogEntry } from '@/types/badge';
import type { Bingo, BingoCompletion, BingoItem, BingoPill } from '@/types/bingo';
import type { Challenge } from '@/store/challenges';

// ═══════════════ Book (public cache) ═══════════════

export type DbBook = {
  isbn: string;
  title: string;
  authors: string[];
  pages: number | null;
  published_at: string | null;
  cover_url: string | null;
  source: string | null;
  categories: string[];
};

export function bookFromDb(row: DbBook): Book {
  return {
    isbn: row.isbn,
    title: row.title,
    authors: row.authors ?? [],
    pages: row.pages ?? undefined,
    publishedAt: row.published_at ?? undefined,
    coverUrl: row.cover_url ?? undefined,
    source: (row.source as Book['source']) ?? undefined,
    categories: row.categories && row.categories.length > 0 ? row.categories : undefined,
  };
}

export function bookToDb(book: Book): DbBook {
  return {
    isbn: book.isbn,
    title: book.title,
    authors: book.authors,
    pages: book.pages ?? null,
    published_at: book.publishedAt ?? null,
    cover_url: book.coverUrl ?? null,
    source: book.source ?? null,
    categories: book.categories ?? [],
  };
}

// ═══════════════ UserBook ═══════════════

export type DbUserBook = {
  id: string;
  user_id: string;
  book_isbn: string;
  status: 'wishlist' | 'to_read' | 'reading' | 'paused' | 'read' | 'abandoned';
  rating: number | null;
  favorite: boolean;
  started_at: string | null;
  finished_at: string | null;
  genres: string[];
  paused_page: number | null;
  paused_summary: string | null;
  created_at?: string | null;
};

export function userBookFromDb(row: DbUserBook, book: Book): UserBook {
  const genres = row.genres && row.genres.length > 0 ? row.genres : undefined;
  return {
    id: row.id,
    userId: row.user_id,
    book,
    status: row.status,
    rating: row.rating ?? undefined,
    favorite: row.favorite,
    startedAt: row.started_at ?? undefined,
    finishedAt: row.finished_at ?? undefined,
    genres,
    addedAt: row.created_at ?? undefined,
    pausedPage: row.paused_page ?? undefined,
    pausedSummary: row.paused_summary ?? undefined,
  };
}

export function userBookToDb(ub: UserBook, userId: string): DbUserBook {
  // Garde-fou contre la contrainte CHECK user_books_dates_ok :
  // si les deux timestamps existent et sont inversés, on aligne started_at
  // sur finished_at (les opérations futures recréeront un cycle propre).
  let startedAt = ub.startedAt ?? null;
  const finishedAt = ub.finishedAt ?? null;
  if (startedAt && finishedAt && startedAt > finishedAt) {
    startedAt = finishedAt;
  }
  return {
    id: ub.id,
    user_id: userId,
    book_isbn: ub.book.isbn,
    status: ub.status,
    rating: ub.rating ?? null,
    favorite: ub.favorite,
    started_at: startedAt,
    finished_at: finishedAt,
    genres: ub.genres ?? [],
    paused_page: ub.pausedPage ?? null,
    paused_summary: ub.pausedSummary ?? null,
  };
}

// ═══════════════ ReadingSession ═══════════════

export type DbReadingSession = {
  id: string;
  user_book_id: string;
  // Rempli en phase 4 (migration 0010_read_cycles.sql). Tant que la
  // colonne n'existe pas, nullable côté DB — côté store on expose ''.
  cycle_id: string | null;
  duration_sec: number;
  stopped_at_page: number;
  started_at: string;
};

export function sessionFromDb(row: DbReadingSession): ReadingSession {
  return {
    id: row.id,
    userBookId: row.user_book_id,
    cycleId: row.cycle_id ?? '',
    durationSec: row.duration_sec,
    stoppedAtPage: row.stopped_at_page,
    startedAt: row.started_at,
  };
}

export function sessionToDb(s: ReadingSession): DbReadingSession {
  return {
    id: s.id,
    user_book_id: s.userBookId,
    cycle_id: s.cycleId || null,
    duration_sec: s.durationSec,
    stopped_at_page: s.stoppedAtPage,
    started_at: s.startedAt,
  };
}

// ═══════════════ ReadCycle ═══════════════

export type DbReadCycle = {
  id: string;
  user_book_id: string;
  index: number;
  started_at: string;
  finished_at: string | null;
  final_page: number | null;
  outcome: ReadCycleOutcome | null;
};

export function cycleFromDb(row: DbReadCycle): ReadCycle {
  return {
    id: row.id,
    userBookId: row.user_book_id,
    index: row.index,
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? undefined,
    finalPage: row.final_page ?? undefined,
    outcome: row.outcome ?? undefined,
  };
}

export function cycleToDb(c: ReadCycle): DbReadCycle {
  return {
    id: c.id,
    user_book_id: c.userBookId,
    index: c.index,
    started_at: c.startedAt,
    finished_at: c.finishedAt ?? null,
    final_page: c.finalPage ?? null,
    outcome: c.outcome ?? null,
  };
}

// ═══════════════ BookLoan ═══════════════

export type DbBookLoan = {
  id: string;
  user_book_id: string;
  contact_name: string;
  direction: 'lent' | 'borrowed';
  date_out: string;
  date_back: string | null;
  note: string | null;
};

export function loanFromDb(row: DbBookLoan): BookLoan {
  return {
    id: row.id,
    userBookId: row.user_book_id,
    contactName: row.contact_name,
    direction: row.direction,
    dateOut: row.date_out,
    dateBack: row.date_back ?? undefined,
    note: row.note ?? undefined,
  };
}

export function loanToDb(l: BookLoan): DbBookLoan {
  return {
    id: l.id,
    user_book_id: l.userBookId,
    contact_name: l.contactName,
    direction: l.direction,
    date_out: l.dateOut,
    date_back: l.dateBack ?? null,
    note: l.note ?? null,
  };
}

// ═══════════════ ReadingSheet (JSONB) ═══════════════

export type DbSheetContent = {
  sections: SheetSection[];
  appearance?: SheetAppearanceOverride;
  stickers?: PlacedSticker[];
};

export type DbReadingSheet = {
  id: string;
  user_book_id: string;
  content: DbSheetContent;
  is_public: boolean;
  updated_at: string;
};

export function sheetFromDb(row: DbReadingSheet): ReadingSheet {
  const appearance = row.content?.appearance;
  const hasAppearance =
    appearance && typeof appearance === 'object' && Object.keys(appearance).length > 0;
  const stickers = row.content?.stickers;
  const hasStickers = Array.isArray(stickers) && stickers.length > 0;
  return {
    id: row.id,
    userBookId: row.user_book_id,
    sections: row.content?.sections ?? [],
    updatedAt: row.updated_at,
    appearance: hasAppearance ? appearance : undefined,
    stickers: hasStickers ? stickers : undefined,
    isPublic: row.is_public,
  };
}

export function sheetToDb(
  sheet: ReadingSheet,
): Omit<DbReadingSheet, 'id'> {
  const content: DbSheetContent = { sections: sheet.sections };
  if (sheet.appearance && Object.keys(sheet.appearance).length > 0) {
    content.appearance = sheet.appearance;
  }
  if (sheet.stickers && sheet.stickers.length > 0) {
    content.stickers = sheet.stickers;
  }
  return {
    user_book_id: sheet.userBookId,
    content,
    updated_at: sheet.updatedAt,
    is_public: sheet.isPublic ?? false,
  };
}

// ═══════════════ Challenge ═══════════════

export type DbChallenge = {
  id: string;
  user_id: string;
  year: number;
  target_count: number;
};

export function challengeFromDb(row: DbChallenge): Challenge {
  return { year: row.year, target: row.target_count };
}

export function challengeToDb(
  c: Challenge,
  userId: string,
): Omit<DbChallenge, 'id'> {
  return {
    user_id: userId,
    year: c.year,
    target_count: c.target,
  };
}

// ═══════════════ Reading streak days ═══════════════

export type DbStreakDay = {
  user_id: string;
  day: string; // YYYY-MM-DD
};

export function streakDayFromDb(row: DbStreakDay): string {
  return row.day;
}

// ═══════════════ User badges ═══════════════

export type DbUserBadge = {
  user_id: string;
  badge_key: string;
  earned_at: string;
};

export function badgeFromDb(row: DbUserBadge): { key: string; earnedAt: string } {
  return { key: row.badge_key, earnedAt: row.earned_at };
}

// ═══════════════ Badge catalog ═══════════════

export type DbBadgeCatalog = {
  badge_key: string;
  title: string;
  description: string;
  graphic_kind: 'svg' | 'lottie';
  graphic_payload: string;
  graphic_tokens: Record<string, string> | null;
  retired_at: string | null;
};

export function badgeCatalogFromDb(row: DbBadgeCatalog): BadgeCatalogEntry {
  return {
    badgeKey: row.badge_key,
    title: row.title,
    description: row.description,
    graphicKind: row.graphic_kind,
    graphicPayload: row.graphic_payload,
    graphicTokens: row.graphic_tokens ?? {},
    retiredAt: row.retired_at,
  };
}

// ═══════════════ Bingo ═══════════════

// Contenu du champ `grid` JSONB — items positionnés + métadonnées applicatives
// qui n'ont pas besoin d'une colonne dédiée (savedAt, appearance snapshot).
type DbBingoGrid = {
  items: BingoItem[];
  savedAt?: string;
  appearance?: SheetAppearance;
};

export type DbBingo = {
  id: string;
  user_id: string;
  title: string;
  grid: DbBingoGrid;
  created_at: string;
  archived_at: string | null;
};

export function bingoFromDb(row: DbBingo): Bingo {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    items: row.grid?.items ?? [],
    createdAt: row.created_at,
    archivedAt: row.archived_at ?? undefined,
    savedAt: row.grid?.savedAt ?? undefined,
    appearance: row.grid?.appearance,
  };
}

export function bingoToDb(b: Bingo): Omit<DbBingo, 'created_at'> {
  return {
    id: b.id,
    user_id: b.userId,
    title: b.title,
    grid: { items: b.items, savedAt: b.savedAt, appearance: b.appearance },
    archived_at: b.archivedAt ?? null,
  };
}

export type DbBingoCompletion = {
  id: string;
  bingo_id: string;
  cell_index: number;
  user_book_id: string | null;
  completed_at: string;
};

export function completionFromDb(row: DbBingoCompletion): BingoCompletion | null {
  // user_book_id nullable côté DB (on delete set null). Skip si orphelin.
  if (!row.user_book_id) return null;
  return {
    id: row.id,
    bingoId: row.bingo_id,
    cellIndex: row.cell_index,
    userBookId: row.user_book_id,
    completedAt: row.completed_at,
  };
}

export function completionToDb(c: BingoCompletion): DbBingoCompletion {
  return {
    id: c.id,
    bingo_id: c.bingoId,
    cell_index: c.cellIndex,
    user_book_id: c.userBookId,
    completed_at: c.completedAt,
  };
}

export type DbBingoPill = {
  id: string;
  user_id: string;
  label: string;
  created_at: string;
};

export function pillFromDb(row: DbBingoPill): BingoPill {
  return {
    id: row.id,
    userId: row.user_id,
    label: row.label,
    createdAt: row.created_at,
  };
}

export function pillToDb(p: BingoPill): Omit<DbBingoPill, 'created_at'> {
  return {
    id: p.id,
    user_id: p.userId,
    label: p.label,
  };
}

// ═══════════════ Profile / Preferences ═══════════════

// La colonne JSONB stocke les préférences user en camelCase (pas de transform).
// `avatar_url` vit sur sa propre colonne (SSOT) — pas dans `preferences`.
export type DbProfile = {
  id: string;
  preferences:
    | (Partial<import('@/store/preferences').Preferences> & { avatarUrl?: string | null })
    | null;
};

export function preferencesFromDb(
  row: DbProfile,
): Partial<import('@/store/preferences').Preferences> {
  if (!row.preferences) return {};
  // Strip la clé legacy `avatarUrl` qui pourrait traîner dans le JSONB
  // d'anciens profils — le store useProfile est désormais la seule source.
  const { avatarUrl: _legacy, ...rest } = row.preferences;
  return rest;
}
