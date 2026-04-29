import { isUuid } from '@/lib/id';
import { supabase } from '@/lib/supabase';
import {
  bookToDb,
  challengeToDb,
  loanToDb,
  sessionToDb,
  sheetToDb,
  userBookToDb,
} from '@/lib/sync/mappers';
import { useBookshelf } from '@/store/bookshelf';
import { useChallenges } from '@/store/challenges';
import { useLoans } from '@/store/loans';
import { usePreferences } from '@/store/preferences';
import { useProfile } from '@/store/profile';
import { useReadingSheets } from '@/store/reading-sheets';
import { useReadingStreak } from '@/store/reading-streak';
import { useTimer } from '@/store/timer';

export type PushSummary = {
  books: number;
  userBooks: number;
  sessions: number;
  loans: number;
  sheets: number;
  challenges: number;
  streakDays: number;
  skipped: number;
};

export async function pushLocalData(userId: string): Promise<PushSummary> {
  const books = useBookshelf.getState().books;
  const sessions = useTimer.getState().sessions;
  const loans = useLoans.getState().loans;
  const sheets = useReadingSheets.getState().sheets;
  const challenges = useChallenges.getState().challenges;
  const streakDays = useReadingStreak.getState().manualDays;

  const summary: PushSummary = {
    books: 0,
    userBooks: 0,
    sessions: 0,
    loans: 0,
    sheets: 0,
    challenges: 0,
    streakDays: 0,
    skipped: 0,
  };

  // 1. Books (catalogue public, clé ISBN)
  const uniqueBooks = Array.from(
    new Map(books.map((ub) => [ub.book.isbn, ub.book])).values(),
  );
  if (uniqueBooks.length > 0) {
    const { error } = await supabase
      .from('books')
      .upsert(uniqueBooks.map(bookToDb), { onConflict: 'isbn' });
    if (error) throw new Error(`books: ${error.message}`);
    summary.books = uniqueBooks.length;
  }

  // 2. User books — on ne pousse que les IDs UUID valides
  const validUserBooks = books.filter((ub) => isUuid(ub.id));
  summary.skipped += books.length - validUserBooks.length;
  const validUserBookIds = new Set(validUserBooks.map((ub) => ub.id));
  if (validUserBooks.length > 0) {
    const { error } = await supabase
      .from('user_books')
      .upsert(
        validUserBooks.map((ub) => userBookToDb(ub, userId)),
        { onConflict: 'id' },
      );
    if (error) throw new Error(`user_books: ${error.message}`);
    summary.userBooks = validUserBooks.length;
  }

  // 3. Sessions — doivent référencer un user_book valide
  const validSessions = sessions.filter(
    (s) => isUuid(s.id) && validUserBookIds.has(s.userBookId),
  );
  summary.skipped += sessions.length - validSessions.length;
  if (validSessions.length > 0) {
    const { error } = await supabase
      .from('reading_sessions')
      .upsert(validSessions.map(sessionToDb), { onConflict: 'id' });
    if (error) throw new Error(`sessions: ${error.message}`);
    summary.sessions = validSessions.length;
  }

  // 4. Loans
  const validLoans = loans.filter(
    (l) => isUuid(l.id) && validUserBookIds.has(l.userBookId),
  );
  summary.skipped += loans.length - validLoans.length;
  if (validLoans.length > 0) {
    const { error } = await supabase
      .from('book_loans')
      .upsert(validLoans.map(loanToDb), { onConflict: 'id' });
    if (error) throw new Error(`loans: ${error.message}`);
    summary.loans = validLoans.length;
  }

  // 5. Sheets (upsert par user_book_id)
  const validSheets = Object.values(sheets).filter((s) =>
    validUserBookIds.has(s.userBookId),
  );
  summary.skipped += Object.keys(sheets).length - validSheets.length;
  if (validSheets.length > 0) {
    const { error } = await supabase
      .from('reading_sheets')
      .upsert(validSheets.map(sheetToDb), { onConflict: 'user_book_id' });
    if (error) throw new Error(`sheets: ${error.message}`);
    summary.sheets = validSheets.length;
  }

  // 6. Challenges (upsert par user_id + year)
  const challengeList = Object.values(challenges);
  if (challengeList.length > 0) {
    const { error } = await supabase
      .from('reading_challenges')
      .upsert(
        challengeList.map((c) => challengeToDb(c, userId)),
        { onConflict: 'user_id,year' },
      );
    if (error) throw new Error(`challenges: ${error.message}`);
    summary.challenges = challengeList.length;
  }

  // 7. Reading streak days (upsert par user_id + day)
  if (streakDays.length > 0) {
    const rows = streakDays.map((day) => ({ user_id: userId, day }));
    const { error } = await supabase
      .from('reading_streak_days')
      .upsert(rows, { onConflict: 'user_id,day' });
    if (error) throw new Error(`streak_days: ${error.message}`);
    summary.streakDays = streakDays.length;
  }

  // 8. Profile row (préférences + username + avatar_url) — un seul upsert pour merge
  const { dailyReadingGoalMinutes, homeCardOrder } = usePreferences.getState();
  const { username, avatarUrl } = useProfile.getState();
  const profileRow: Record<string, unknown> = {
    id: userId,
    preferences: { dailyReadingGoalMinutes, homeCardOrder },
    avatar_url: avatarUrl,
  };
  if (username) profileRow.username = username;
  const { error: prefErr } = await supabase
    .from('profiles')
    .upsert(profileRow, { onConflict: 'id' });
  if (prefErr) throw new Error(`profile: ${prefErr.message}`);

  return summary;
}
