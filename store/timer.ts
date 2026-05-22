import { APP_SLUG } from '@/constants/app';
import { newId } from '@/lib/id';
import { dayOfSession, isDayAutoValidated } from '@/lib/streak-validation';
import { getSyncUserId } from '@/lib/sync/session';
import {
  rpcFinishReadingCycle,
  syncDeleteSession,
  syncInsertSession,
  syncUpdateSessionNote,
  syncUpsertCycle,
} from '@/lib/sync/writers';
import { useBookshelf } from '@/store/bookshelf';
import { usePreferences } from '@/store/preferences';
import { useReadingStreak } from '@/store/reading-streak';
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
  // Brouillon de note saisi pendant la session via le bouton Notes du
  // timer. Flushé sur la ReadingSession finale au stop. Persisté avec
  // l'active pour survivre à un kill app pendant que le timer tourne.
  draftNote?: string;
};

type TimerState = {
  active: ActiveSession | null;
  sessions: ReadingSession[];
  cycles: ReadCycle[];

  start: (userBookId: string) => void;
  // `atMs` : timestamp wall-clock du tap quand l'action vient d'une source
  // native (Live Activity / notification Android). Permet de capturer le bon
  // instant même si le moteur JS était suspendu (device verrouillé). Défaut
  // à Date.now() pour les appels in-app.
  pause: (atMs?: number) => void;
  // `resumeRef` : soit `{ virtualStartMs }` (Live Activity iOS — startedAt
  // déjà avancé natif), soit `{ atMs }` (instant du tap), soit rien (in-app).
  resume: (resumeRef?: { atMs?: number; virtualStartMs?: number }) => void;
  // `note` : override le draftNote (typique depuis TimerStopModal qui a
  // sa propre textarea pré-remplie). Si omis, on flush draftNote tel quel.
  stop: (stoppedAtPage: number, note?: string) => ReadingSession | null;
  cancel: () => void;
  deleteSession: (sessionId: string) => void;
  // Saisie pendant la session active. Pas de persistance DB tant que la
  // session n'est pas stoppée — le draft vit dans `active`.
  setDraftNote: (note: string) => void;
  // Édition a posteriori d'une note de session déjà persistée. Met à
  // jour le store local + push (queueable).
  updateSessionNote: (sessionId: string, note: string) => void;

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

      pause: (atMs) => {
        const { active } = get();
        if (!active || active.pausedAt !== null) return;
        set({ active: { ...active, pausedAt: atMs ?? Date.now() } });
      },

      resume: (resumeRef) => {
        const { active } = get();
        if (!active || active.pausedAt === null) return;
        // Côté Live Activity iOS, l'intent a déjà calculé le nouveau virtual
        // start (startedAt + pausedDuration). On en déduit accumulatedPausedMs
        // sans dépendre du timing JS — fiable même si JS s'est réveillé tard.
        const newAccumulatedPausedMs =
          resumeRef?.virtualStartMs !== undefined
            ? resumeRef.virtualStartMs - active.startedAt
            : active.accumulatedPausedMs +
              ((resumeRef?.atMs ?? Date.now()) - active.pausedAt);
        set({
          active: {
            ...active,
            pausedAt: null,
            accumulatedPausedMs: newAccumulatedPausedMs,
          },
        });
      },

      stop: (stoppedAtPage, note) => {
        const { active } = get();
        if (!active) return null;
        const endTime = active.pausedAt ?? Date.now();
        const durationSec = Math.max(
          0,
          Math.round((endTime - active.startedAt - active.accumulatedPausedMs) / 1000),
        );
        // L'override `note` du caller (typique : TimerStopModal) prend le
        // pas sur le draft. trim → null pour rester cohérent avec la DB
        // qui reçoit null pour les notes vides (cf. sessionToDb).
        const rawNote = note ?? active.draftNote;
        const trimmed = rawNote?.trim();
        const session: ReadingSession = {
          id: newId(),
          userBookId: active.userBookId,
          cycleId: active.cycleId,
          durationSec,
          stoppedAtPage: Math.max(0, Math.floor(stoppedAtPage)),
          startedAt: new Date(active.startedAt).toISOString(),
          note: trimmed ? trimmed : undefined,
        };
        set((s) => ({ active: null, sessions: [session, ...s.sessions] }));
        const userId = getSyncUserId();
        if (userId) {
          void syncInsertSession(session);
          // Si la session valide le jour, on crée une row reading_streak_days
          // auto (sans écraser un éventuel manual=true). Le store local est
          // mis à jour de façon optimiste — re-pull resynchronisera.
          const day = dayOfSession(session);
          const goalMinutes = usePreferences.getState().dailyReadingGoalMinutes;
          if (isDayAutoValidated(get().sessions, day, goalMinutes)) {
            useReadingStreak.getState().ensureAutoDay(day, goalMinutes);
          }
        }
        return session;
      },

      cancel: () => set({ active: null }),

      setDraftNote: (note) => {
        const { active } = get();
        if (!active) return;
        set({ active: { ...active, draftNote: note } });
      },

      updateSessionNote: (sessionId, note) => {
        const trimmed = note.trim();
        const next = trimmed ? trimmed : undefined;
        let changed = false;
        set((s) => {
          const idx = s.sessions.findIndex((x) => x.id === sessionId);
          if (idx < 0) return s;
          if (s.sessions[idx].note === next) return s;
          changed = true;
          const sessions = [...s.sessions];
          sessions[idx] = { ...sessions[idx], note: next };
          return { sessions };
        });
        if (!changed) return;
        if (getSyncUserId()) {
          void syncUpdateSessionNote(sessionId, trimmed || null);
        }
      },

      deleteSession: (sessionId) => {
        const removed = get().sessions.find((s) => s.id === sessionId);
        if (!removed) return;
        set((s) => ({
          sessions: s.sessions.filter((x) => x.id !== sessionId),
        }));
        const userId = getSyncUserId();
        if (!userId) return;
        void syncDeleteSession(sessionId);
        // Si le jour de la session supprimée n'est plus auto-validé et que
        // la row n'est pas manuelle, retirer la row reading_streak_days.
        const day = dayOfSession(removed);
        const goalMinutes = usePreferences.getState().dailyReadingGoalMinutes;
        const stillAuto = isDayAutoValidated(get().sessions, day, goalMinutes);
        if (!stillAuto) {
          useReadingStreak.getState().removeAutoDay(day);
        }
      },

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
      name: `${APP_SLUG}-timer`,
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
