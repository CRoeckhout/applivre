import { newId } from '@/lib/id';
import { getSyncUserId } from '@/lib/sync/session';
import {
  rpcFinishReadingCycle,
  syncInsertSession,
  syncUpsertCycle,
} from '@/lib/sync/writers';
import { useBookshelf } from '@/store/bookshelf';
import type {
  ReadCycle,
  ReadCycleOutcome,
  ReadingSession,
} from '@/types/book';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type ActiveSession = {
  userBookId: string;
  cycleId: string;
  startedAt: number;
  accumulatedPausedMs: number;
  pausedAt: number | null;
};

type TimerState = {
  active: ActiveSession | null;
  sessions: ReadingSession[];
  cycles: ReadCycle[];

  start: (userBookId: string) => void;
  pause: () => void;
  resume: () => void;
  stop: (stoppedAtPage: number) => ReadingSession | null;
  cancel: () => void;

  // Cycles
  finishCycle: (
    userBookId: string,
    outcome: ReadCycleOutcome,
    finalPage?: number,
  ) => void;

  // Sélecteurs
  sessionsFor: (userBookId: string) => ReadingSession[];
  totalSecondsFor: (userBookId: string) => number;
  lastPageFor: (userBookId: string) => number;
  cyclesFor: (userBookId: string) => ReadCycle[];
  currentCycleFor: (userBookId: string) => ReadCycle | undefined;
  sessionsInCycle: (cycleId: string) => ReadingSession[];
};

// Retourne le cycle ouvert pour un livre, ou en crée un nouveau.
// Ne mute pas le state — renvoie { cycle, cycles } à utiliser dans set().
function ensureOpenCycle(
  cycles: ReadCycle[],
  userBookId: string,
): { cycle: ReadCycle; cycles: ReadCycle[] } {
  const bookCycles = cycles.filter((c) => c.userBookId === userBookId);
  const open = bookCycles.find((c) => !c.finishedAt);
  if (open) return { cycle: open, cycles };
  const nextIndex = bookCycles.reduce((m, c) => Math.max(m, c.index), 0) + 1;
  const cycle: ReadCycle = {
    id: newId(),
    userBookId,
    index: nextIndex,
    startedAt: new Date().toISOString(),
  };
  return { cycle, cycles: [...cycles, cycle] };
}

export const useTimer = create<TimerState>()(
  persist(
    (set, get) => ({
      active: null,
      sessions: [],
      cycles: [],

      start: (userBookId) => {
        if (get().active) return;
        const prev = get().cycles;
        const { cycle, cycles } = ensureOpenCycle(prev, userBookId);
        set({
          cycles,
          active: {
            userBookId,
            cycleId: cycle.id,
            startedAt: Date.now(),
            accumulatedPausedMs: 0,
            pausedAt: null,
          },
        });
        useBookshelf.getState().updateStatus(userBookId, 'reading');
        // Si nouveau cycle → push serveur (FK pour la session à venir).
        if (getSyncUserId() && cycles !== prev) {
          void syncUpsertCycle(cycle);
        }
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
        const session: ReadingSession = {
          id: newId(),
          userBookId: active.userBookId,
          cycleId: active.cycleId,
          durationSec,
          stoppedAtPage: Math.max(0, Math.floor(stoppedAtPage)),
          startedAt: new Date(active.startedAt).toISOString(),
        };
        set((s) => ({ active: null, sessions: [session, ...s.sessions] }));
        if (getSyncUserId()) void syncInsertSession(session);
        return session;
      },

      cancel: () => set({ active: null }),

      finishCycle: (userBookId, outcome, finalPage) => {
        let updated: ReadCycle | undefined;
        set((s) => {
          const current = s.cycles.find(
            (c) => c.userBookId === userBookId && !c.finishedAt,
          );
          if (!current) return s;
          const derivedFinal =
            finalPage ??
            s.sessions
              .filter((x) => x.cycleId === current.id)
              .reduce((m, x) => Math.max(m, x.stoppedAtPage), 0);
          updated = {
            ...current,
            finishedAt: new Date().toISOString(),
            outcome,
            finalPage: derivedFinal > 0 ? derivedFinal : undefined,
          };
          return {
            cycles: s.cycles.map((c) => (c.id === current.id ? updated! : c)),
          };
        });
        // RPC atomique (cycle + user_book.status) si online. En cas
        // d'échec réseau on retombe sur l'upsert enqueueable.
        if (updated && getSyncUserId()) {
          void rpcFinishReadingCycle(
            userBookId,
            outcome,
            updated.finalPage ?? null,
          ).catch(() => {
            // Fallback : upsert queueable → réconciliation plus tard.
            if (updated) void syncUpsertCycle(updated);
          });
        }
      },

      // Sélecteurs
      sessionsFor: (userBookId) =>
        get().sessions.filter((s) => s.userBookId === userBookId),
      totalSecondsFor: (userBookId) =>
        get()
          .sessions.filter((s) => s.userBookId === userBookId)
          .reduce((sum, s) => sum + s.durationSec, 0),
      lastPageFor: (userBookId) => {
        const cycle = get().cyclesFor(userBookId).find((c) => !c.finishedAt);
        if (!cycle) return 0;
        return get()
          .sessions.filter((s) => s.cycleId === cycle.id)
          .reduce((m, s) => Math.max(m, s.stoppedAtPage), 0);
      },
      cyclesFor: (userBookId) =>
        get()
          .cycles.filter((c) => c.userBookId === userBookId)
          .sort((a, b) => a.index - b.index),
      currentCycleFor: (userBookId) => {
        const list = get().cyclesFor(userBookId);
        return list.find((c) => !c.finishedAt) ?? list[list.length - 1];
      },
      sessionsInCycle: (cycleId) =>
        get().sessions.filter((s) => s.cycleId === cycleId),
    }),
    {
      name: 'applivre-timer',
      version: 3,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        active: s.active,
        sessions: s.sessions,
        cycles: s.cycles,
      }),
      migrate: (persisted, version) => {
        // v1 → v2 : le champ pagesRead (delta) devient stoppedAtPage (absolu).
        // La conversion exacte est impossible (on perd les index absolus), on vide les sessions.
        if (version < 2) {
          return { active: null, sessions: [], cycles: [] } as Partial<TimerState>;
        }
        // v2 → v3 : rattache toutes les sessions existantes à un cycle rétroactif
        // par livre. Le cycle est clos si le livre avait déjà un statut final
        // côté bookshelf — sinon laissé ouvert pour que la lecture en cours continue.
        if (version < 3) {
          const p = persisted as {
            active?: ActiveSession | null;
            sessions?: ReadingSession[];
          };
          const sessions = p.sessions ?? [];
          const byBook = new Map<string, ReadingSession[]>();
          for (const s of sessions) {
            const arr = byBook.get(s.userBookId) ?? [];
            arr.push(s);
            byBook.set(s.userBookId, arr);
          }
          const books = useBookshelf.getState().books;
          const cycles: ReadCycle[] = [];
          const migratedSessions: ReadingSession[] = [];
          for (const [userBookId, list] of byBook) {
            const sorted = [...list].sort(
              (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
            );
            const first = sorted[0];
            const last = sorted[sorted.length - 1];
            const ub = books.find((b) => b.id === userBookId);
            const status = ub?.status;
            const outcome: ReadCycleOutcome | undefined =
              status === 'read' ? 'read' : status === 'abandoned' ? 'abandoned' : undefined;
            const cycle: ReadCycle = {
              id: newId(),
              userBookId,
              index: 1,
              startedAt: first.startedAt,
              finishedAt: outcome ? last.startedAt : undefined,
              outcome,
              finalPage: outcome ? last.stoppedAtPage : undefined,
            };
            cycles.push(cycle);
            for (const s of sorted) {
              migratedSessions.push({ ...s, cycleId: cycle.id });
            }
          }
          // Sessions arrivées hors ordre — on remet tri desc comme l'existant.
          migratedSessions.sort(
            (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
          );
          // L'active éventuel : si présent, attacher à un cycle ouvert (nouveau si livre read).
          let active = p.active ?? null;
          if (active) {
            const ub = books.find((b) => b.id === active!.userBookId);
            if (ub?.status === 'read' || ub?.status === 'abandoned') {
              // Livre déjà clos — l'active devient invalide, on le drop.
              active = null;
            } else {
              // Trouve ou crée un cycle ouvert pour ce livre.
              let openCycle = cycles.find(
                (c) => c.userBookId === active!.userBookId && !c.finishedAt,
              );
              if (!openCycle) {
                const priorMax = cycles
                  .filter((c) => c.userBookId === active!.userBookId)
                  .reduce((m, c) => Math.max(m, c.index), 0);
                openCycle = {
                  id: newId(),
                  userBookId: active.userBookId,
                  index: priorMax + 1,
                  startedAt: new Date(active.startedAt).toISOString(),
                };
                cycles.push(openCycle);
              }
              active = { ...active, cycleId: openCycle.id };
            }
          }
          return {
            active,
            sessions: migratedSessions,
            cycles,
          } as Partial<TimerState>;
        }
        return persisted as Partial<TimerState>;
      },
    },
  ),
);
