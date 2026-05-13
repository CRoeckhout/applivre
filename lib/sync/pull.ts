import { supabase } from '@/lib/supabase';
import {
  badgeCatalogFromDb,
  badgeFromDb,
  bingoFromDb,
  bookFromDb,
  challengeFromDb,
  completionFromDb,
  cycleFromDb,
  loanFromDb,
  pillFromDb,
  preferencesFromDb,
  sessionFromDb,
  sheetFromDb,
  streakDayFromDb,
  userBookFromDb,
  type DbBadgeCatalog,
  type DbBingo,
  type DbBingoCompletion,
  type DbBingoPill,
  type DbBook,
  type DbBookLoan,
  type DbChallenge,
  type DbProfile,
  type DbReadCycle,
  type DbReadingSession,
  type DbReadingSheet,
  type DbStreakDay,
  type DbUserBadge,
  type DbUserBook,
} from '@/lib/sync/mappers';
import { useBadgeCatalog } from '@/store/badge-catalog';
import { useBadges } from '@/store/badges';
import { useBingos } from '@/store/bingo';
import { useBookshelf } from '@/store/bookshelf';
import { useChallenges, type Challenge } from '@/store/challenges';
import { useLoans } from '@/store/loans';
import { usePreferences, DEFAULT_PREFERENCES } from '@/store/preferences';
import { useProfile } from '@/store/profile';
import { useReadingSheets } from '@/store/reading-sheets';
import { useReadingStreak } from '@/store/reading-streak';
import { useTimer } from '@/store/timer';
import type { BingoCompletion } from '@/types/bingo';
import type { ReadingSession, ReadingSheet, UserBook } from '@/types/book';
import { dayOfSession } from '@/lib/streak-validation';
import { syncEnsureStreakDayAuto } from '@/lib/sync/writers';

export async function pullUserData(userId: string): Promise<void> {
  // Toutes les requêtes filtrent explicitement par user_id (direct ou via
  // les user_book_ids/bingo_ids du user). Le RLS admin (migration 0059)
  // autorise un admin à SELECT toutes les rows sans filtre — sans ce filtre
  // explicite, un admin agrégerait les données de tous les users dans son
  // propre store local.
  //
  // Phase 1 : tables avec user_id direct + user_books (source de
  // user_book_ids) + bingos (source de bingo_ids).
  const [
    ubRes,
    streakRes,
    chalRes,
    profileRes,
    bingoRes,
    pillRes,
    badgeRes,
    catalogRes,
  ] = await Promise.all([
    supabase
      .from('user_books')
      .select('*, book:books(*)')
      .eq('user_id', userId),
    supabase
      .from('reading_streak_days')
      .select('*')
      .eq('user_id', userId),
    supabase
      .from('reading_challenges')
      .select('*')
      .eq('user_id', userId),
    supabase
      .from('profiles')
      .select('id, username, avatar_url, preferences')
      .eq('id', userId)
      .maybeSingle(),
    supabase.from('bingos').select('*').eq('user_id', userId),
    supabase.from('bingo_pills').select('*').eq('user_id', userId),
    supabase.from('user_badges').select('*').eq('user_id', userId),
    supabase
      .from('badge_catalog')
      .select(
        'badge_key, title, description, graphic_kind, graphic_payload, graphic_tokens, retired_at',
      ),
  ]);

  if (ubRes.error) throw new Error(`Pull user_books: ${ubRes.error.message}`);
  if (streakRes.error) throw new Error(`Pull streak: ${streakRes.error.message}`);
  if (chalRes.error) throw new Error(`Pull challenges: ${chalRes.error.message}`);
  if (profileRes.error) throw new Error(`Pull profile: ${profileRes.error.message}`);
  if (bingoRes.error) throw new Error(`Pull bingos: ${bingoRes.error.message}`);
  if (pillRes.error) throw new Error(`Pull bingo_pills: ${pillRes.error.message}`);
  if (badgeRes.error) throw new Error(`Pull user_badges: ${badgeRes.error.message}`);
  if (catalogRes.error) throw new Error(`Pull badge_catalog: ${catalogRes.error.message}`);

  type UbRow = DbUserBook & { book: DbBook };
  const ubRows = (ubRes.data as UbRow[]) ?? [];
  const userBookIds = ubRows.map((r) => r.id);
  const bingoRows = (bingoRes.data as DbBingo[]) ?? [];
  const bingoIds = bingoRows.map((b) => b.id);

  // Phase 2 : tables enfants filtrées par les ids du user.
  // Si l'utilisateur n'a aucun livre/bingo, on évite l'appel réseau (l'IN
  // sur une liste vide retourne 0 row de toute façon).
  const emptyOk = { data: [] as never[], error: null as null } as const;
  const [sessRes, loanRes, sheetRes, cycleRes, completionRes] =
    await Promise.all([
      userBookIds.length > 0
        ? supabase
            .from('reading_sessions')
            .select('*')
            .in('user_book_id', userBookIds)
        : Promise.resolve(emptyOk),
      userBookIds.length > 0
        ? supabase
            .from('book_loans')
            .select('*')
            .in('user_book_id', userBookIds)
        : Promise.resolve(emptyOk),
      userBookIds.length > 0
        ? supabase
            .from('reading_sheets')
            .select('*')
            .in('user_book_id', userBookIds)
        : Promise.resolve(emptyOk),
      userBookIds.length > 0
        ? supabase
            .from('read_cycles')
            .select('*')
            .in('user_book_id', userBookIds)
        : Promise.resolve(emptyOk),
      bingoIds.length > 0
        ? supabase
            .from('bingo_completions')
            .select('*')
            .in('bingo_id', bingoIds)
        : Promise.resolve(emptyOk),
    ]);

  if (sessRes.error) throw new Error(`Pull sessions: ${sessRes.error.message}`);
  if (loanRes.error) throw new Error(`Pull loans: ${loanRes.error.message}`);
  if (sheetRes.error) throw new Error(`Pull sheets: ${sheetRes.error.message}`);
  if (cycleRes.error) throw new Error(`Pull cycles: ${cycleRes.error.message}`);
  if (completionRes.error)
    throw new Error(`Pull bingo_completions: ${completionRes.error.message}`);

  const books: UserBook[] = ubRows.map((row) =>
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

  const streakDays = ((streakRes.data as DbStreakDay[]) ?? []).map(
    streakDayFromDb,
  );

  const profileRow = profileRes.data as
    | (DbProfile & { username: string | null; avatar_url: string | null })
    | null;
  const prefs = profileRow ? preferencesFromDb(profileRow) : {};
  const username = profileRow?.username ?? null;
  const avatarUrl = profileRow?.avatar_url ?? null;

  const bingos = bingoRows.map(bingoFromDb);
  const completions: Record<string, BingoCompletion[]> = {};
  for (const row of (completionRes.data as DbBingoCompletion[]) ?? []) {
    const c = completionFromDb(row);
    if (!c) continue;
    (completions[c.bingoId] ||= []).push(c);
  }
  const pills = ((pillRes.data as DbBingoPill[]) ?? []).map(pillFromDb);

  const earned: Record<string, string> = {};
  for (const row of (badgeRes.data as DbUserBadge[]) ?? []) {
    const b = badgeFromDb(row);
    earned[b.key] = b.earnedAt;
  }

  const catalogList = ((catalogRes.data as DbBadgeCatalog[]) ?? []).map(
    badgeCatalogFromDb,
  );

  useBookshelf.setState({ books });
  useTimer.setState({ sessions, cycles });
  useLoans.setState({ loans });
  useReadingSheets.setState({ sheets });
  useChallenges.setState({ challenges });
  useReadingStreak.setState({ days: streakDays });
  usePreferences.setState({ ...DEFAULT_PREFERENCES, ...prefs });
  useProfile.setState({ username, avatarUrl });
  useBingos.setState({ bingos, completions, pills });
  useBadges.setState({ earned });
  useBadgeCatalog.getState().setAll(catalogList);

  // Backfill : pour les sessions qui ont validé un jour mais n'ont jamais
  // créé de row reading_streak_days (sessions pré-introduction de l'auto-
  // upsert, ou écritures qui ont échoué côté queue). Idempotent : on
  // n'écrit que si le jour est absent de la table (existant manuel/auto
  // préservé). On passe `userId` explicitement parce que `getSyncUserId()`
  // n'est armé qu'après pullUserData côté _layout.tsx.
  backfillAutoStreakDays(
    userId,
    streakDays,
    sessions,
    prefs.dailyReadingGoalMinutes,
  );
}

function backfillAutoStreakDays(
  userId: string,
  existingDays: { day: string; manual: boolean }[],
  sessions: ReadingSession[],
  goalMinutes: number | undefined,
): void {
  const goal = goalMinutes ?? DEFAULT_PREFERENCES.dailyReadingGoalMinutes;
  const threshold = goal * 60;
  const existing = new Set(existingDays.map((d) => d.day));
  const byDay = new Map<string, number>();
  for (const s of sessions) {
    const day = dayOfSession(s);
    byDay.set(day, (byDay.get(day) ?? 0) + s.durationSec);
  }
  const missing: string[] = [];
  for (const [day, total] of byDay) {
    if (total >= threshold && !existing.has(day)) missing.push(day);
  }
  if (missing.length === 0) return;

  useReadingStreak.setState({
    days: [
      ...existingDays,
      ...missing.map((day) => ({ day, manual: false })),
    ],
  });
  for (const day of missing) {
    void syncEnsureStreakDayAuto(day, userId, goal);
  }
}
