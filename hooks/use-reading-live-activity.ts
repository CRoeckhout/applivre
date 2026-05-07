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
// Android-only : subscribe aux events `onPause` / `onResume` envoyés par les
// boutons de la notification (broadcast natif → instant, sans ouvrir l'app).
// Sur iOS, ces boutons utilisent un deep link qui ouvre la fiche livre.
export function useReadingLiveActivity() {
  const active = useTimer((s) => s.active);
  const books = useBookshelf((s) => s.books);
  const runningRef = useRef(false);

  useEffect(() => {
    const available = isLiveActivityAvailable();
    if (!available) return;

    if (!active) {
      if (runningRef.current) {
        void endReadingActivity();
        runningRef.current = false;
      }
      return;
    }

    const ub = books.find((b) => b.id === active.userBookId);
    if (!ub) return;

    const virtualStartMs = active.startedAt + active.accumulatedPausedMs;
    const isPaused = active.pausedAt !== null;
    const pausedAtMs = active.pausedAt ?? null;

    if (!runningRef.current) {
      // Cas relaunch : l'activity OS tourne déjà, on l'adopte via update
      // plutôt que la re-créer (évite le blink end+start).
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
      runningRef.current = true;
    } else {
      void updateReadingActivity({
        startedAtMs: virtualStartMs,
        isPaused,
        pausedAtMs,
      });
    }
  }, [active, books]);

  // Une seule subscription pour les events Android (pause/resume depuis la
  // notification). Sur iOS et hors Expo, no-op silencieux.
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
