import {
  internalDeleteChallenge,
  internalDeleteLoan,
  internalDeleteSheet,
  internalDeleteStreakDay,
  internalDeleteUserBook,
  internalInsertSession,
  internalUpsertBook,
  internalUpsertChallenge,
  internalUpsertLoan,
  internalUpsertPreferences,
  internalUpsertSheet,
  internalUpsertStreakDay,
  internalUpsertUserBook,
  internalUpsertUsername,
} from '@/lib/sync/internals';
import type { Preferences } from '@/store/preferences';
import { flushQueue } from '@/lib/sync/queue';
import { useSyncQueue, type QueuedOp } from '@/store/sync-queue';
import type { Challenge } from '@/store/challenges';
import type { Book, BookLoan, ReadingSession, ReadingSheet, UserBook } from '@/types/book';

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
    () => internalUpsertSheet(sheet),
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

export function syncUpsertStreakDay(day: string, userId: string): Promise<void> {
  return runOrQueue(
    () => internalUpsertStreakDay(day, userId),
    () => ({ kind: 'upsertStreakDay', payload: { day, userId } }),
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
