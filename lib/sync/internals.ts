import { supabase } from '@/lib/supabase';
import {
  bingoToDb,
  bookToDb,
  challengeToDb,
  completionToDb,
  cycleToDb,
  loanToDb,
  pillToDb,
  sessionToDb,
  sheetToDb,
  userBookToDb,
} from '@/lib/sync/mappers';
import type { Bingo, BingoCompletion, BingoPill } from '@/types/bingo';
import type { Challenge } from '@/store/challenges';
import type {
  Book,
  BookLoan,
  ReadCycle,
  ReadingSession,
  ReadingSheet,
  UserBook,
} from '@/types/book';

// Opérations DB brutes : throw en cas d'erreur.
// Les writers publics (writers.ts) et la queue (queue.ts) s'appuient dessus.

export class DbError extends Error {
  // Code Postgres (ex: '23514' check_violation, '23503' FK, '23505' unique).
  // https://www.postgresql.org/docs/current/errcodes-appendix.html
  code?: string;
  // Message bref et friendly, prêt pour affichage UI (toast / alert).
  userMessage: string;
  // Message technique brut (logging, debug).
  raw: string;

  constructor(raw: string, code: string | undefined, userMessage: string) {
    super(userMessage);
    this.name = 'DbError';
    this.code = code;
    this.userMessage = userMessage;
    this.raw = raw;
  }
}

// Map codes Postgres + pattern texte → message FR friendly.
// Lu par l'UI pour afficher un toast intelligible.
function friendlyMessage(code: string | undefined, raw: string): string {
  const low = raw.toLowerCase();
  if (code === '23514') {
    // check_violation — contraintes CHECK / triggers custom
    if (low.includes('stopped_at_page')) {
      return 'Page renseignée au-delà du nombre total de pages du livre.';
    }
    if (low.includes('dates_ok')) {
      return 'Date de fin antérieure à la date de début.';
    }
    if (low.includes('outcome_when_finished')) {
      return 'Statut de cycle incohérent (fini / outcome manquant).';
    }
    return 'Donnée invalide (contrainte serveur).';
  }
  if (code === '23505') {
    // unique_violation
    if (low.includes('one_open_cycle')) {
      return 'Une lecture est déjà en cours sur ce livre.';
    }
    if (low.includes('user_books')) {
      return 'Ce livre est déjà dans ta bibliothèque.';
    }
    return 'Doublon refusé.';
  }
  if (code === '23503') {
    return 'Référence incohérente (cycle / livre non trouvé).';
  }
  if (code === '42501' || low.includes('row-level security')) {
    return "Action non autorisée pour ton compte.";
  }
  return 'Erreur serveur : ' + raw;
}

type PgError = { message: string; code?: string } | null;

async function throwIfError(
  p: PromiseLike<{ error: PgError }>,
): Promise<void> {
  const { error } = await p;
  if (!error) return;
  const code = error.code;
  const msg = friendlyMessage(code, error.message);
  throw new DbError(error.message, code, msg);
}

// Books
export async function internalUpsertBook(book: Book): Promise<void> {
  await throwIfError(supabase.from('books').upsert(bookToDb(book), { onConflict: 'isbn' }));
}

// User books
export async function internalUpsertUserBook(ub: UserBook, userId: string): Promise<void> {
  await throwIfError(
    supabase.from('user_books').upsert(userBookToDb(ub, userId), { onConflict: 'id' }),
  );
}

export async function internalDeleteUserBook(id: string): Promise<void> {
  await throwIfError(supabase.from('user_books').delete().eq('id', id));
}

// Sessions
export async function internalInsertSession(s: ReadingSession): Promise<void> {
  await throwIfError(supabase.from('reading_sessions').insert(sessionToDb(s)));
}

// Read cycles
export async function internalUpsertCycle(c: ReadCycle): Promise<void> {
  await throwIfError(
    supabase.from('read_cycles').upsert(cycleToDb(c), { onConflict: 'id' }),
  );
}

// RPC atomique : crée ou retourne le cycle ouvert + passe user_book
// en 'reading'. Retourne le cycle serveur (id, index) à utiliser comme
// référence locale — évite les divergences d'index au sync.
export async function internalStartReadingSession(
  userBookId: string,
): Promise<ReadCycle> {
  const { data, error } = await supabase.rpc('start_reading_session', {
    p_user_book_id: userBookId,
  });
  if (error) {
    throw new DbError(
      error.message,
      (error as { code?: string }).code,
      friendlyMessageFromErr(error),
    );
  }
  // data = 1 ligne read_cycles
  const row = Array.isArray(data) ? data[0] : data;
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

// RPC atomique : ferme le cycle + bascule user_books.status +
// stamp finished_at. Idempotent (rejoue sans effet si déjà clos).
export async function internalFinishReadingCycle(
  userBookId: string,
  outcome: 'read' | 'abandoned',
  finalPage: number | null,
): Promise<ReadCycle> {
  const { data, error } = await supabase.rpc('finish_reading_cycle', {
    p_user_book_id: userBookId,
    p_outcome: outcome,
    p_final_page: finalPage,
  });
  if (error) {
    throw new DbError(
      error.message,
      (error as { code?: string }).code,
      friendlyMessageFromErr(error),
    );
  }
  const row = Array.isArray(data) ? data[0] : data;
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

function friendlyMessageFromErr(err: { message: string; code?: string }): string {
  return friendlyMessage(err.code, err.message);
}

// Loans
export async function internalUpsertLoan(loan: BookLoan): Promise<void> {
  await throwIfError(
    supabase.from('book_loans').upsert(loanToDb(loan), { onConflict: 'id' }),
  );
}

export async function internalDeleteLoan(id: string): Promise<void> {
  await throwIfError(supabase.from('book_loans').delete().eq('id', id));
}

// Sheets
export async function internalUpsertSheet(sheet: ReadingSheet): Promise<void> {
  await throwIfError(
    supabase
      .from('reading_sheets')
      .upsert(sheetToDb(sheet), { onConflict: 'user_book_id' }),
  );
}

export async function internalDeleteSheet(userBookId: string): Promise<void> {
  await throwIfError(
    supabase.from('reading_sheets').delete().eq('user_book_id', userBookId),
  );
}

// Challenges
export async function internalUpsertChallenge(c: Challenge, userId: string): Promise<void> {
  await throwIfError(
    supabase
      .from('reading_challenges')
      .upsert(challengeToDb(c, userId), { onConflict: 'user_id,year' }),
  );
}

export async function internalDeleteChallenge(year: number, userId: string): Promise<void> {
  await throwIfError(
    supabase.from('reading_challenges').delete().eq('user_id', userId).eq('year', year),
  );
}

// Username : colonne séparée sur profiles (unique-indexée côté DB).
// Le throw d'unicité (code 23505) est remonté tel quel à l'appelant pour
// affichage "ce nom est déjà pris".
export async function internalUpsertUsername(
  userId: string,
  username: string,
): Promise<void> {
  await throwIfError(
    supabase.from('profiles').upsert(
      { id: userId, username },
      { onConflict: 'id' },
    ),
  );
}

// RPC de vérif de disponibilité (bypasse RLS en SECURITY DEFINER).
// Retourne `true` si le nom est libre (ou déjà le tien).
export async function internalCheckUsernameAvailable(
  candidate: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_username_available', {
    candidate,
  });
  if (error) throw new Error(error.message);
  return data === true;
}

// Preferences (stockées dans profiles.preferences JSONB).
// On upsert le row par id : l'insert crée la ligne si manquante, l'update
// ne touche que la colonne preferences si la ligne existe déjà.
export async function internalUpsertPreferences(
  userId: string,
  prefs: Partial<import('@/store/preferences').Preferences>,
): Promise<void> {
  await throwIfError(
    supabase.from('profiles').upsert(
      { id: userId, preferences: prefs },
      { onConflict: 'id' },
    ),
  );
}

// Avatar URL : colonne séparée sur profiles (lue par l'admin et d'autres
// consommateurs sans plonger dans le JSONB). SSOT côté DB.
export async function internalUpsertAvatarUrl(
  userId: string,
  avatarUrl: string | null,
): Promise<void> {
  await throwIfError(
    supabase.from('profiles').upsert(
      { id: userId, avatar_url: avatarUrl },
      { onConflict: 'id' },
    ),
  );
}

// Bingos
export async function internalUpsertBingo(b: Bingo): Promise<void> {
  await throwIfError(
    supabase.from('bingos').upsert(bingoToDb(b), { onConflict: 'id' }),
  );
}

export async function internalDeleteBingo(id: string): Promise<void> {
  await throwIfError(supabase.from('bingos').delete().eq('id', id));
}

export async function internalUpsertBingoCompletion(c: BingoCompletion): Promise<void> {
  await throwIfError(
    supabase
      .from('bingo_completions')
      .upsert(completionToDb(c), { onConflict: 'bingo_id,cell_index' }),
  );
}

export async function internalDeleteBingoCompletion(
  bingoId: string,
  cellIndex: number,
): Promise<void> {
  await throwIfError(
    supabase
      .from('bingo_completions')
      .delete()
      .eq('bingo_id', bingoId)
      .eq('cell_index', cellIndex),
  );
}

export async function internalDeleteCompletionsForUserBook(
  userBookId: string,
): Promise<void> {
  await throwIfError(
    supabase.from('bingo_completions').delete().eq('user_book_id', userBookId),
  );
}

export async function internalUpsertBingoPill(p: BingoPill): Promise<void> {
  await throwIfError(
    supabase.from('bingo_pills').upsert(pillToDb(p), { onConflict: 'id' }),
  );
}

export async function internalDeleteBingoPill(id: string): Promise<void> {
  await throwIfError(supabase.from('bingo_pills').delete().eq('id', id));
}

// User badges : aucune écriture client directe.
// L'unlock passe par l'RPC serveur evaluate_user_badges (lib/sync/eval-badges.ts)
// qui valide les conditions côté DB. Voir migration 0017.

// Reading streak days
export async function internalUpsertStreakDay(
  day: string,
  userId: string,
  goalMinutes: number,
): Promise<void> {
  await throwIfError(
    supabase
      .from('reading_streak_days')
      .upsert(
        { user_id: userId, day, goal_minutes: goalMinutes },
        { onConflict: 'user_id,day' },
      ),
  );
}

export async function internalDeleteStreakDay(day: string, userId: string): Promise<void> {
  await throwIfError(
    supabase.from('reading_streak_days').delete().eq('user_id', userId).eq('day', day),
  );
}
