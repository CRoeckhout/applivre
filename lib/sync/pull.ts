import { supabase } from '@/lib/supabase';
import {
  bookFromDb,
  challengeFromDb,
  cycleFromDb,
  loanFromDb,
  preferencesFromDb,
  sessionFromDb,
  sheetFromDb,
  streakDayFromDb,
  userBookFromDb,
  type DbBook,
  type DbBookLoan,
  type DbChallenge,
  type DbProfile,
  type DbReadCycle,
  type DbReadingSession,
  type DbReadingSheet,
  type DbStreakDay,
  type DbUserBook,
} from '@/lib/sync/mappers';
import { useBookshelf } from '@/store/bookshelf';
import { useChallenges, type Challenge } from '@/store/challenges';
import { useLoans } from '@/store/loans';
import { usePreferences, DEFAULT_PREFERENCES } from '@/store/preferences';
import { useProfile } from '@/store/profile';
import { useReadingSheets } from '@/store/reading-sheets';
import { useReadingStreak } from '@/store/reading-streak';
import { useTimer } from '@/store/timer';
import type { ReadingSheet, UserBook } from '@/types/book';

export async function pullUserData(userId: string): Promise<void> {
  const [
    ubRes,
    sessRes,
    loanRes,
    sheetRes,
    chalRes,
    streakRes,
    profileRes,
    cycleRes,
  ] = await Promise.all([
    supabase
      .from('user_books')
      .select('*, book:books(*)')
      .eq('user_id', userId),
    supabase.from('reading_sessions').select('*'),
    supabase.from('book_loans').select('*'),
    supabase.from('reading_sheets').select('*'),
    supabase.from('reading_challenges').select('*'),
    supabase.from('reading_streak_days').select('*'),
    supabase
      .from('profiles')
      .select('id, username, preferences')
      .eq('id', userId)
      .maybeSingle(),
    supabase.from('read_cycles').select('*'),
  ]);

  if (ubRes.error) throw new Error(`Pull user_books: ${ubRes.error.message}`);
  if (sessRes.error) throw new Error(`Pull sessions: ${sessRes.error.message}`);
  if (loanRes.error) throw new Error(`Pull loans: ${loanRes.error.message}`);
  if (sheetRes.error) throw new Error(`Pull sheets: ${sheetRes.error.message}`);
  if (chalRes.error) throw new Error(`Pull challenges: ${chalRes.error.message}`);
  if (streakRes.error) throw new Error(`Pull streak: ${streakRes.error.message}`);
  if (profileRes.error) throw new Error(`Pull profile: ${profileRes.error.message}`);
  if (cycleRes.error) throw new Error(`Pull cycles: ${cycleRes.error.message}`);

  type UbRow = DbUserBook & { book: DbBook };
  const books: UserBook[] = ((ubRes.data as UbRow[]) ?? []).map((row) =>
    userBookFromDb(row, bookFromDb(row.book)),
  );

  const sessions = ((sessRes.data as DbReadingSession[]) ?? []).map(sessionFromDb);
  const cycles = ((cycleRes.data as DbReadCycle[]) ?? []).map(cycleFromDb);
  const loans = ((loanRes.data as DbBookLoan[]) ?? []).map(loanFromDb);

  const sheets: Record<string, ReadingSheet> = {};
  for (const row of (sheetRes.data as DbReadingSheet[]) ?? []) {
    const sheet = sheetFromDb(row);
    sheets[sheet.userBookId] = sheet;
  }

  const challenges: Record<number, Challenge> = {};
  for (const row of (chalRes.data as DbChallenge[]) ?? []) {
    const c = challengeFromDb(row);
    challenges[c.year] = c;
  }

  const manualDays = ((streakRes.data as DbStreakDay[]) ?? []).map(streakDayFromDb);

  const profileRow = profileRes.data as (DbProfile & { username: string | null }) | null;
  const prefs = profileRow ? preferencesFromDb(profileRow) : {};
  const username = profileRow?.username ?? null;

  useBookshelf.setState({ books });
  useTimer.setState({ sessions, cycles });
  useLoans.setState({ loans });
  useReadingSheets.setState({ sheets });
  useChallenges.setState({ challenges });
  useReadingStreak.setState({ manualDays });
  usePreferences.setState({ ...DEFAULT_PREFERENCES, ...prefs });
  useProfile.setState({ username });
}
