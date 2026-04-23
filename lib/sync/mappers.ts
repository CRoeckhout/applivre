import type {
  Book,
  BookLoan,
  ReadingSession,
  ReadingSheet,
  SheetAppearanceOverride,
  SheetSection,
  UserBook,
} from '@/types/book';
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
  categories: string[] | null;
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
    categories: book.categories ?? null,
  };
}

// ═══════════════ UserBook ═══════════════

export type DbUserBook = {
  id: string;
  user_id: string;
  book_isbn: string;
  status: 'to_read' | 'reading' | 'read' | 'abandoned';
  rating: number | null;
  favorite: boolean;
  started_at: string | null;
  finished_at: string | null;
  genres: string[];
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
  };
}

export function userBookToDb(ub: UserBook, userId: string): DbUserBook {
  return {
    id: ub.id,
    user_id: userId,
    book_isbn: ub.book.isbn,
    status: ub.status,
    rating: ub.rating ?? null,
    favorite: ub.favorite,
    started_at: ub.startedAt ?? null,
    finished_at: ub.finishedAt ?? null,
    genres: ub.genres ?? [],
  };
}

// ═══════════════ ReadingSession ═══════════════

export type DbReadingSession = {
  id: string;
  user_book_id: string;
  duration_sec: number;
  stopped_at_page: number;
  started_at: string;
};

export function sessionFromDb(row: DbReadingSession): ReadingSession {
  return {
    id: row.id,
    userBookId: row.user_book_id,
    durationSec: row.duration_sec,
    stoppedAtPage: row.stopped_at_page,
    startedAt: row.started_at,
  };
}

export function sessionToDb(s: ReadingSession): DbReadingSession {
  return {
    id: s.id,
    user_book_id: s.userBookId,
    duration_sec: s.durationSec,
    stopped_at_page: s.stoppedAtPage,
    started_at: s.startedAt,
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
  return {
    userBookId: row.user_book_id,
    sections: row.content?.sections ?? [],
    updatedAt: row.updated_at,
    appearance: hasAppearance ? appearance : undefined,
  };
}

export function sheetToDb(
  sheet: ReadingSheet,
): Omit<DbReadingSheet, 'id' | 'is_public'> {
  const content: DbSheetContent = { sections: sheet.sections };
  if (sheet.appearance && Object.keys(sheet.appearance).length > 0) {
    content.appearance = sheet.appearance;
  }
  return {
    user_book_id: sheet.userBookId,
    content,
    updated_at: sheet.updatedAt,
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

// ═══════════════ Profile / Preferences ═══════════════

// La colonne JSONB stocke les préférences user en camelCase (pas de transform).
export type DbProfile = {
  id: string;
  preferences: Partial<import('@/store/preferences').Preferences> | null;
};

export function preferencesFromDb(
  row: DbProfile,
): Partial<import('@/store/preferences').Preferences> {
  return row.preferences ?? {};
}
