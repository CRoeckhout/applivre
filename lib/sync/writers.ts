import {
  internalDeleteBingo,
  internalDeleteBingoCompletion,
  internalDeleteBingoPill,
  internalDeleteChallenge,
  internalDeleteCompletionsForUserBook,
  internalDeleteLoan,
  internalDeleteSheet,
  internalDeleteStreakDay,
  internalDeleteUserBook,
  internalFinishReadingCycle,
  internalInsertSession,
  internalStartReadingSession,
  internalUpsertBingo,
  internalUpsertBingoCompletion,
  internalUpsertBingoPill,
  internalUpsertBook,
  internalUpsertChallenge,
  internalUpsertCycle,
  internalUpsertLoan,
  internalUpsertAvatarUrl,
  internalUpsertPreferences,
  internalUpsertSheet,
  internalUpsertStreakDay,
  internalUpsertUserBook,
  internalUpsertUsername,
} from '@/lib/sync/internals';
import type { Bingo, BingoCompletion, BingoPill } from '@/types/bingo';
import type { Preferences } from '@/store/preferences';
import { scheduleBadgeEval } from '@/lib/sync/eval-badges';
import { flushQueue } from '@/lib/sync/queue';
import { useSyncQueue, type QueuedOp } from '@/store/sync-queue';
import type { Challenge } from '@/store/challenges';
import type {
  Book,
  BookLoan,
  ReadCycle,
  ReadingSession,
  ReadingSheet,
  UserBook,
} from '@/types/book';

// Toutes les writers appelées depuis les stores : fire-and-forget.
// - Succès → tente de drainer la queue (catch up du backlog)
// - Échec → enqueue pour retry ultérieur (offline / 5xx / réseau)

function enqueue(op: QueuedOp): void {
  useSyncQueue.getState().enqueue(op);
}

async function runOrQueue(
  fn: () => Promise<void>,
  onFailQueue: () => QueuedOp,
): Promise<void> {
  try {
    await fn();
    // Best-effort : tenter de drainer ce qui trainait
    void flushQueue();
    // Toute mutation peut potentiellement débloquer un badge — on planifie
    // une évaluation serveur debouncée (coalesce les rafales).
    scheduleBadgeEval();
  } catch {
    enqueue(onFailQueue());
  }
}

// ═══════════════ Books ═══════════════

export function syncUpsertBook(book: Book): Promise<void> {
  return runOrQueue(
    () => internalUpsertBook(book),
    () => ({ kind: 'upsertBook', payload: { book } }),
  );
}

// ═══════════════ User books ═══════════════

export function syncUpsertUserBook(ub: UserBook, userId: string): Promise<void> {
  return runOrQueue(
    () => internalUpsertUserBook(ub, userId),
    () => ({ kind: 'upsertUserBook', payload: { ub, userId } }),
  );
}

export function syncDeleteUserBook(id: string): Promise<void> {
  return runOrQueue(
    () => internalDeleteUserBook(id),
    () => ({ kind: 'deleteUserBook', payload: { id } }),
  );
}

// ═══════════════ Sessions ═══════════════

export function syncInsertSession(s: ReadingSession): Promise<void> {
  return runOrQueue(
    () => internalInsertSession(s),
    () => ({ kind: 'insertSession', payload: { session: s } }),
  );
}

// ═══════════════ Read cycles ═══════════════

export function syncUpsertCycle(c: ReadCycle): Promise<void> {
  return runOrQueue(
    () => internalUpsertCycle(c),
    () => ({ kind: 'upsertCycle', payload: { cycle: c } }),
  );
}

// RPC atomique (start). Online uniquement — en cas d'échec on retombe
// sur un upsert de fallback côté caller (cycle déjà créé en local).
export function rpcStartReadingSession(userBookId: string) {
  return internalStartReadingSession(userBookId);
}

// RPC atomique (finish). Préférer à l'upsert direct : la transition
// cycle + user_book.status est cohérente côté DB.
export function rpcFinishReadingCycle(
  userBookId: string,
  outcome: 'read' | 'abandoned',
  finalPage: number | null,
) {
  return internalFinishReadingCycle(userBookId, outcome, finalPage);
}

// ═══════════════ Loans ═══════════════

export function syncUpsertLoan(loan: BookLoan): Promise<void> {
  return runOrQueue(
    () => internalUpsertLoan(loan),
    () => ({ kind: 'upsertLoan', payload: { loan } }),
  );
}

export function syncDeleteLoan(id: string): Promise<void> {
  return runOrQueue(
    () => internalDeleteLoan(id),
    () => ({ kind: 'deleteLoan', payload: { id } }),
  );
}

// ═══════════════ Reading sheets (debounced) ═══════════════

const sheetTimers = new Map<string, { timer: ReturnType<typeof setTimeout>; latest: ReadingSheet }>();
const SHEET_DEBOUNCE_MS = 600;

function fireSheetUpsert(sheet: ReadingSheet): Promise<void> {
  return runOrQueue(
    async () => {
      const id = await internalUpsertSheet(sheet);
      // Réinjecte l'id DB dans le store local — permet à /sheet/view/[id]
      // d'être adressable dès la 1re sauvegarde, sans attendre un pull.
      // Import dynamique pour éviter le cycle store ↔ writers à l'init module.
      if (id) {
        const { useReadingSheets } = await import('@/store/reading-sheets');
        useReadingSheets.getState().setSheetId(sheet.userBookId, id);
      }
    },
    () => ({ kind: 'upsertSheet', payload: { sheet } }),
  );
}

export function syncUpsertSheetDebounced(sheet: ReadingSheet): void {
  const existing = sheetTimers.get(sheet.userBookId);
  if (existing) clearTimeout(existing.timer);
  const timer = setTimeout(() => {
    const current = sheetTimers.get(sheet.userBookId);
    sheetTimers.delete(sheet.userBookId);
    if (current) void fireSheetUpsert(current.latest);
  }, SHEET_DEBOUNCE_MS);
  sheetTimers.set(sheet.userBookId, { timer, latest: sheet });
}

export function syncDeleteSheet(userBookId: string): Promise<void> {
  const existing = sheetTimers.get(userBookId);
  if (existing) clearTimeout(existing.timer);
  sheetTimers.delete(userBookId);
  return runOrQueue(
    () => internalDeleteSheet(userBookId),
    () => ({ kind: 'deleteSheet', payload: { userBookId } }),
  );
}

// ═══════════════ Challenges ═══════════════

export function syncUpsertChallenge(c: Challenge, userId: string): Promise<void> {
  return runOrQueue(
    () => internalUpsertChallenge(c, userId),
    () => ({ kind: 'upsertChallenge', payload: { challenge: c, userId } }),
  );
}

export function syncDeleteChallenge(year: number, userId: string): Promise<void> {
  return runOrQueue(
    () => internalDeleteChallenge(year, userId),
    () => ({ kind: 'deleteChallenge', payload: { year, userId } }),
  );
}

// ═══════════════ Reading streak days ═══════════════

export function syncUpsertStreakDay(
  day: string,
  userId: string,
  goalMinutes: number,
): Promise<void> {
  return runOrQueue(
    () => internalUpsertStreakDay(day, userId, goalMinutes),
    () => ({ kind: 'upsertStreakDay', payload: { day, userId, goalMinutes } }),
  );
}

export function syncDeleteStreakDay(day: string, userId: string): Promise<void> {
  return runOrQueue(
    () => internalDeleteStreakDay(day, userId),
    () => ({ kind: 'deleteStreakDay', payload: { day, userId } }),
  );
}

// ═══════════════ Preferences ═══════════════

export function syncUpsertPreferences(
  userId: string,
  prefs: Partial<Preferences>,
): Promise<void> {
  return runOrQueue(
    () => internalUpsertPreferences(userId, prefs),
    () => ({ kind: 'upsertPreferences', payload: { userId, prefs } }),
  );
}

export function syncUpsertUsername(userId: string, username: string): Promise<void> {
  return runOrQueue(
    () => internalUpsertUsername(userId, username),
    () => ({ kind: 'upsertUsername', payload: { userId, username } }),
  );
}

export function syncUpsertAvatarUrl(
  userId: string,
  avatarUrl: string | null,
): Promise<void> {
  return runOrQueue(
    () => internalUpsertAvatarUrl(userId, avatarUrl),
    () => ({ kind: 'upsertAvatarUrl', payload: { userId, avatarUrl } }),
  );
}

// ═══════════════ Bingos ═══════════════

export function syncUpsertBingo(bingo: Bingo): Promise<void> {
  return runOrQueue(
    () => internalUpsertBingo(bingo),
    () => ({ kind: 'upsertBingo', payload: { bingo } }),
  );
}

export function syncDeleteBingo(id: string): Promise<void> {
  return runOrQueue(
    () => internalDeleteBingo(id),
    () => ({ kind: 'deleteBingo', payload: { id } }),
  );
}

export function syncUpsertBingoCompletion(completion: BingoCompletion): Promise<void> {
  return runOrQueue(
    () => internalUpsertBingoCompletion(completion),
    () => ({ kind: 'upsertBingoCompletion', payload: { completion } }),
  );
}

export function syncDeleteBingoCompletion(
  bingoId: string,
  cellIndex: number,
): Promise<void> {
  return runOrQueue(
    () => internalDeleteBingoCompletion(bingoId, cellIndex),
    () => ({ kind: 'deleteBingoCompletion', payload: { bingoId, cellIndex } }),
  );
}

export function syncDeleteCompletionsForUserBook(userBookId: string): Promise<void> {
  return runOrQueue(
    () => internalDeleteCompletionsForUserBook(userBookId),
    () => ({ kind: 'deleteCompletionsForUserBook', payload: { userBookId } }),
  );
}

export function syncUpsertBingoPill(pill: BingoPill): Promise<void> {
  return runOrQueue(
    () => internalUpsertBingoPill(pill),
    () => ({ kind: 'upsertBingoPill', payload: { pill } }),
  );
}

export function syncDeleteBingoPill(id: string): Promise<void> {
  return runOrQueue(
    () => internalDeleteBingoPill(id),
    () => ({ kind: 'deleteBingoPill', payload: { id } }),
  );
}

