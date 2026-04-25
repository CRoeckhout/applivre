import { newId } from '@/lib/id';
import type { Challenge } from '@/store/challenges';
import type { Preferences } from '@/store/preferences';
import type {
  Book,
  BookLoan,
  ReadCycle,
  ReadingSession,
  ReadingSheet,
  UserBook,
} from '@/types/book';
import type { Bingo, BingoCompletion, BingoPill } from '@/types/bingo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type QueuedOp =
  | { kind: 'upsertBook'; payload: { book: Book } }
  | { kind: 'upsertUserBook'; payload: { ub: UserBook; userId: string } }
  | { kind: 'deleteUserBook'; payload: { id: string } }
  | { kind: 'insertSession'; payload: { session: ReadingSession } }
  | { kind: 'upsertCycle'; payload: { cycle: ReadCycle } }
  | { kind: 'upsertLoan'; payload: { loan: BookLoan } }
  | { kind: 'deleteLoan'; payload: { id: string } }
  | { kind: 'upsertSheet'; payload: { sheet: ReadingSheet } }
  | { kind: 'deleteSheet'; payload: { userBookId: string } }
  | { kind: 'upsertChallenge'; payload: { challenge: Challenge; userId: string } }
  | { kind: 'deleteChallenge'; payload: { year: number; userId: string } }
  | { kind: 'upsertStreakDay'; payload: { day: string; userId: string } }
  | { kind: 'deleteStreakDay'; payload: { day: string; userId: string } }
  | {
      kind: 'upsertPreferences';
      payload: { userId: string; prefs: Partial<Preferences> };
    }
  | {
      kind: 'upsertUsername';
      payload: { userId: string; username: string };
    }
  | { kind: 'upsertBingo'; payload: { bingo: Bingo } }
  | { kind: 'deleteBingo'; payload: { id: string } }
  | {
      kind: 'upsertBingoCompletion';
      payload: { completion: BingoCompletion };
    }
  | {
      kind: 'deleteBingoCompletion';
      payload: { bingoId: string; cellIndex: number };
    }
  | {
      kind: 'deleteCompletionsForUserBook';
      payload: { userBookId: string };
    }
  | { kind: 'upsertBingoPill'; payload: { pill: BingoPill } }
  | { kind: 'deleteBingoPill'; payload: { id: string } };

export type QueueEntry = QueuedOp & {
  id: string;
  createdAt: number;
  attempts: number;
  nextRetryAt?: number;
};

export const MAX_ATTEMPTS = 5;

type QueueState = {
  ops: QueueEntry[];
  enqueue: (op: QueuedOp) => void;
  remove: (id: string) => void;
  updateOp: (id: string, patch: Partial<Pick<QueueEntry, 'attempts' | 'nextRetryAt'>>) => void;
  clear: () => void;
};

export const useSyncQueue = create<QueueState>()(
  persist(
    (set) => ({
      ops: [],
      enqueue: (op) =>
        set((state) => ({
          ops: [
            ...state.ops,
            { ...op, id: newId(), createdAt: Date.now(), attempts: 0 },
          ],
        })),
      remove: (id) => set((state) => ({ ops: state.ops.filter((o) => o.id !== id) })),
      updateOp: (id, patch) =>
        set((state) => ({
          ops: state.ops.map((o) => (o.id === id ? { ...o, ...patch } : o)),
        })),
      clear: () => set({ ops: [] }),
    }),
    {
      name: 'applivre-sync-queue',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
