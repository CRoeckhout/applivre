import {
  endReadingActivity,
  hasActiveReadingActivity,
  isLiveActivityAvailable,
  startReadingActivity,
  updateReadingActivity,
} from 'applivre-live-activity';
import { useBookshelf } from '@/store/bookshelf';
import { useTimer } from '@/store/timer';
import { useEffect, useRef } from 'react';

// Pilote la Live Activity iOS depuis le store timer. No-op en Expo Go
// ou hors iOS (le module natif n'est pas lié → isLiveActivityAvailable
// renvoie false).
//
// Astuce elapsed : on passe une `startedAt` virtuelle = wallStart +
// accumulatedPausedMs. SwiftUI `Text(timerInterval:)` calcule ensuite
// l'elapsed réel depuis cette ancre, tick-seconde gratuit côté OS.
export function useReadingLiveActivity() {
  const active = useTimer((s) => s.active);
  const books = useBookshelf((s) => s.books);
  const runningRef = useRef(false);

  useEffect(() => {
    const available = isLiveActivityAvailable();
    console.log('[live-activity] available=', available, 'active=', !!active);
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
    console.log('[live-activity] starting/updating for', ub.book.title);

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
}
