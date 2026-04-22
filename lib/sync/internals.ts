import { supabase } from '@/lib/supabase';
import {
  bookToDb,
  challengeToDb,
  loanToDb,
  sessionToDb,
  sheetToDb,
  userBookToDb,
} from '@/lib/sync/mappers';
import type { Challenge } from '@/store/challenges';
import type { Book, BookLoan, ReadingSession, ReadingSheet, UserBook } from '@/types/book';

// Opérations DB brutes : throw en cas d'erreur.
// Les writers publics (writers.ts) et la queue (queue.ts) s'appuient dessus.

async function throwIfError(p: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await p;
  if (error) throw new Error(error.message);
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

// Reading streak days
export async function internalUpsertStreakDay(day: string, userId: string): Promise<void> {
  await throwIfError(
    supabase
      .from('reading_streak_days')
      .upsert({ user_id: userId, day }, { onConflict: 'user_id,day' }),
  );
}

export async function internalDeleteStreakDay(day: string, userId: string): Promise<void> {
  await throwIfError(
    supabase.from('reading_streak_days').delete().eq('user_id', userId).eq('day', day),
  );
}
