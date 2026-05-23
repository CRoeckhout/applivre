import {
  endReadingActivity,
  hasActiveReadingActivity,
  isLiveActivityAvailable,
  onPauseRequested,
  onResumeRequested,
  startReadingActivity,
  updateReadingActivity,
} from 'grimolia-live-activity';
import { useBookshelf } from '@/store/bookshelf';
import { useTimer } from '@/store/timer';
import { useEffect, useRef } from 'react';

// Pilote la Live Activity (iOS) / la notification ongoing (Android) depuis
// le store timer. No-op en Expo Go ou sur plateforme sans module natif.
//
// Astuce elapsed : on passe une `startedAt` virtuelle = wallStart +
// accumulatedPausedMs. Le timer côté OS calcule ensuite l'elapsed réel
// depuis cette ancre, tick-seconde gratuit.
//
// Architecture : ce hook gère les transitions de cycle (start / end /
// adopt-on-relaunch). Les pause/resume sont poussés à l'Activity par le
// store lui-même (qui appelle updateReadingActivity) — JS est autoritaire
// sur l'état de l'Activity. Les events Darwin du widget délèguent au store,
// qui calcule la math localement (Date.now() - active.pausedAt) et ré-applique
// le state souhaité — ça rectifie les cas où le widget process a fait un
// read cross-process stale lors de son update best-effort.
export function useReadingLiveActivity() {
  const active = useTimer((s) => s.active);
  const books = useBookshelf((s) => s.books);
  // Cycle ID de la dernière itération — détecte les transitions
  // null↔non-null sans réagir aux mutations internes (pause/resume).
  const prevCycleIdRef = useRef<string | null>(null);

  useEffect(() => {
    const available = isLiveActivityAvailable();
    if (!available) return;

    const prevId = prevCycleIdRef.current;
    const currId = active ? active.cycleId : null;
    prevCycleIdRef.current = currId;

    // Session terminée → end l'Activity.
    if (!active) {
      if (prevId) {
        void endReadingActivity();
      }
      return;
    }

    // Pas de transition (même cycle, juste un re-render parce que `books`
    // a bougé ou autre) → ne rien faire, l'Activity est déjà à jour.
    if (prevId === currId) return;

    // Nouveau cycle (start frais ou adopt-on-relaunch). On a besoin du livre
    // pour les attributes ; si pas encore hydraté, on revient plus tard.
    const ub = books.find((b) => b.id === active.userBookId);
    if (!ub) {
      // Reset prev pour retenter au prochain render quand `books` arrive.
      prevCycleIdRef.current = prevId;
      return;
    }

    const virtualStartMs = active.startedAt + active.accumulatedPausedMs;
    const isPaused = active.pausedAt !== null;
    const pausedAtMs = active.pausedAt ?? null;

    // Cas relaunch : l'Activity OS tourne déjà → on l'adopte via update
    // (sync du state JS vers l'Activity en cas de divergence pendant que
    // l'app était killed). Évite le blink end+start.
    if (hasActiveReadingActivity()) {
      void updateReadingActivity({
        startedAtMs: virtualStartMs,
        isPaused,
        pausedAtMs,
      });
    } else {
      void startReadingActivity({
        bookTitle: ub.book.title,
        bookAuthor: ub.book.authors[0] ?? '',
        bookIsbn: ub.book.isbn,
        bookCoverUrl: ub.book.coverUrl ?? null,
        startedAtMs: virtualStartMs,
      });
    }
  }, [active, books]);

  // Events pause/resume depuis le widget natif. Architecture deux-writers :
  // l'intent a déjà fait un update best-effort de l'Activity (critique quand
  // l'app est en background — iOS throttle alors les updates faites depuis
  // le process app, mais pas celles du widget process). Ici JS pousse une
  // SECONDE update par-dessus avec la math autoritaire (Date.now() local)
  // pour rectifier les éventuels read stale de l'intent (typiquement la
  // resume qui a besoin de pausedAt pour avancer startedAt correctement).
  useEffect(() => {
    const unsubPause = onPauseRequested(() => {
      useTimer.getState().pause();
    });
    const unsubResume = onResumeRequested(() => {
      useTimer.getState().resume();
    });
    return () => {
      unsubPause();
      unsubResume();
    };
  }, []);
}
