import { newId } from '@/lib/id';
import { getSyncUserId } from '@/lib/sync/session';
import { syncInsertSession } from '@/lib/sync/writers';
import { useBookshelf } from '@/store/bookshelf';
import type { ReadingSession } from '@/types/book';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type ActiveSession = {
  userBookId: string;
  startedAt: number;
  accumulatedPausedMs: number;
  pausedAt: number | null;
};

type TimerState = {
  active: ActiveSession | null;
  sessions: ReadingSession[];

  start: (userBookId: string) => void;
  pause: () => void;
  resume: () => void;
  stop: (stoppedAtPage: number) => ReadingSession | null;
  cancel: () => void;

  sessionsFor: (userBookId: string) => ReadingSession[];
  totalSecondsFor: (userBookId: string) => number;
  lastPageFor: (userBookId: string) => number;
};

export const useTimer = create<TimerState>()(
  persist(
    (set, get) => ({
      active: null,
      sessions: [],

      start: (userBookId) => {
        if (get().active) return;
        set({
          active: {
            userBookId,
            startedAt: Date.now(),
            accumulatedPausedMs: 0,
            pausedAt: null,
          },
        });
        useBookshelf.getState().updateStatus(userBookId, 'reading');
      },

      pause: () => {
        const { active } = get();
        if (!active || active.pausedAt !== null) return;
        set({ active: { ...active, pausedAt: Date.now() } });
      },

      resume: () => {
        const { active } = get();
        if (!active || active.pausedAt === null) return;
        const pausedDuration = Date.now() - active.pausedAt;
        set({
          active: {
            ...active,
            pausedAt: null,
            accumulatedPausedMs: active.accumulatedPausedMs + pausedDuration,
          },
        });
      },

      stop: (stoppedAtPage) => {
        const { active } = get();
        if (!active) return null;
        const endTime = active.pausedAt ?? Date.now();
        const durationSec = Math.max(
          0,
          Math.round((endTime - active.startedAt - active.accumulatedPausedMs) / 1000),
        );
        if (durationSec < 5) {
          set({ active: null });
          return null;
        }
        const session: ReadingSession = {
          id: newId(),
          userBookId: active.userBookId,
          durationSec,
          stoppedAtPage: Math.max(0, Math.floor(stoppedAtPage)),
          startedAt: new Date(active.startedAt).toISOString(),
        };
        set((s) => ({ active: null, sessions: [session, ...s.sessions] }));
        if (getSyncUserId()) void syncInsertSession(session);
        return session;
      },

      cancel: () => set({ active: null }),

      sessionsFor: (userBookId) => get().sessions.filter((s) => s.userBookId === userBookId),
      totalSecondsFor: (userBookId) =>
        get()
          .sessions.filter((s) => s.userBookId === userBookId)
          .reduce((sum, s) => sum + s.durationSec, 0),
      lastPageFor: (userBookId) =>
        get()
          .sessions.filter((s) => s.userBookId === userBookId)
          .reduce((max, s) => Math.max(max, s.stoppedAtPage), 0),
    }),
    {
      name: 'applivre-timer',
      version: 2,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ active: s.active, sessions: s.sessions }),
      migrate: (persisted, version) => {
        // v1 → v2 : le champ pagesRead (delta) devient stoppedAtPage (absolu).
        // La conversion exacte est impossible (on perd les index absolus), on vide les sessions.
        if (version < 2) {
          return { active: null, sessions: [] } as Partial<TimerState>;
        }
        return persisted as Partial<TimerState>;
      },
    },
  ),
);
