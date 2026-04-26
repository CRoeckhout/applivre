import { nextRetryDelayMs } from '@/lib/sync/backoff';
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
  internalInsertSession,
  internalUpsertBingo,
  internalUpsertBingoCompletion,
  internalUpsertBingoPill,
  internalUpsertBook,
  internalUpsertChallenge,
  internalUpsertCycle,
  internalUpsertLoan,
  internalUpsertPreferences,
  internalUpsertSheet,
  internalUpsertStreakDay,
  internalUpsertUserBadge,
  internalUpsertUserBook,
  internalUpsertUsername,
} from '@/lib/sync/internals';
import { MAX_ATTEMPTS, useSyncQueue, type QueueEntry } from '@/store/sync-queue';

// Mutex pour éviter les flushs concurrents
let flushing = false;

// Timer unique qui planifie le prochain flush automatique
let retryTimer: ReturnType<typeof setTimeout> | null = null;

export async function executeEntry(entry: QueueEntry): Promise<void> {
  switch (entry.kind) {
    case 'upsertBook':
      return internalUpsertBook(entry.payload.book);
    case 'upsertUserBook':
      return internalUpsertUserBook(entry.payload.ub, entry.payload.userId);
    case 'deleteUserBook':
      return internalDeleteUserBook(entry.payload.id);
    case 'insertSession':
      return internalInsertSession(entry.payload.session);
    case 'upsertCycle':
      return internalUpsertCycle(entry.payload.cycle);
    case 'upsertLoan':
      return internalUpsertLoan(entry.payload.loan);
    case 'deleteLoan':
      return internalDeleteLoan(entry.payload.id);
    case 'upsertSheet':
      return internalUpsertSheet(entry.payload.sheet);
    case 'deleteSheet':
      return internalDeleteSheet(entry.payload.userBookId);
    case 'upsertChallenge':
      return internalUpsertChallenge(entry.payload.challenge, entry.payload.userId);
    case 'deleteChallenge':
      return internalDeleteChallenge(entry.payload.year, entry.payload.userId);
    case 'upsertStreakDay':
      return internalUpsertStreakDay(entry.payload.day, entry.payload.userId);
    case 'deleteStreakDay':
      return internalDeleteStreakDay(entry.payload.day, entry.payload.userId);
    case 'upsertPreferences':
      return internalUpsertPreferences(entry.payload.userId, entry.payload.prefs);
    case 'upsertUsername':
      return internalUpsertUsername(entry.payload.userId, entry.payload.username);
    case 'upsertBingo':
      return internalUpsertBingo(entry.payload.bingo);
    case 'deleteBingo':
      return internalDeleteBingo(entry.payload.id);
    case 'upsertBingoCompletion':
      return internalUpsertBingoCompletion(entry.payload.completion);
    case 'deleteBingoCompletion':
      return internalDeleteBingoCompletion(
        entry.payload.bingoId,
        entry.payload.cellIndex,
      );
    case 'deleteCompletionsForUserBook':
      return internalDeleteCompletionsForUserBook(entry.payload.userBookId);
    case 'upsertBingoPill':
      return internalUpsertBingoPill(entry.payload.pill);
    case 'deleteBingoPill':
      return internalDeleteBingoPill(entry.payload.id);
    case 'upsertUserBadge':
      return internalUpsertUserBadge(
        entry.payload.userId,
        entry.payload.badgeKey,
        entry.payload.earnedAt,
      );
  }
}

function scheduleNextRetry(): void {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  const ops = useSyncQueue.getState().ops;
  if (ops.length === 0) return;

  const now = Date.now();
  const soonest = Math.min(...ops.map((o) => o.nextRetryAt ?? now));
  const delay = Math.max(200, soonest - now);

  retryTimer = setTimeout(() => {
    retryTimer = null;
    void flushQueue();
  }, delay);
}

export async function flushQueue(): Promise<{ done: number; dropped: number; kept: number }> {
  if (flushing) return { done: 0, dropped: 0, kept: 0 };
  flushing = true;

  const stats = { done: 0, dropped: 0, kept: 0 };

  try {
    const now = Date.now();
    const snapshot = useSyncQueue
      .getState()
      .ops.filter((o) => (o.nextRetryAt ?? 0) <= now);

    for (const entry of snapshot) {
      try {
        await executeEntry(entry);
        useSyncQueue.getState().remove(entry.id);
        stats.done++;
      } catch (err) {
        const nextAttempts = entry.attempts + 1;
        if (nextAttempts >= MAX_ATTEMPTS) {
          console.warn(
            `[sync:queue] drop après ${MAX_ATTEMPTS} tentatives (${entry.kind})`,
            err,
          );
          useSyncQueue.getState().remove(entry.id);
          stats.dropped++;
        } else {
          useSyncQueue.getState().updateOp(entry.id, {
            attempts: nextAttempts,
            nextRetryAt: Date.now() + nextRetryDelayMs(entry.attempts),
          });
          stats.kept++;
          // Stop ici pour ne pas pilonner un endpoint qui vient d'échouer
          break;
        }
      }
    }
  } finally {
    flushing = false;
    scheduleNextRetry();
  }

  return stats;
}

// Forcer un flush immédiat quel que soit le nextRetryAt (reconnexion réseau)
export async function forceFlushNow(): Promise<ReturnType<typeof flushQueue>> {
  useSyncQueue.setState((s) => ({
    ops: s.ops.map((o) => ({ ...o, nextRetryAt: undefined })),
  }));
  return flushQueue();
}
