import { computeEarnedKeys, maxConsecutiveDays } from '@/lib/badges/evaluate';
import { hasAnyWin } from '@/lib/bingo-win';
import { useBadgeToasts } from '@/store/badge-toasts';
import { useBadges as useBadgesStore } from '@/store/badges';
import { useBingos } from '@/store/bingo';
import { useBookshelf } from '@/store/bookshelf';
import { useReadingSheets } from '@/store/reading-sheets';
import { useReadingStreak } from '@/store/reading-streak';
import type { BadgeStats } from '@/types/badge';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef } from 'react';

export function useBadgeStats(): BadgeStats {
  const sheets = useReadingSheets((s) => s.sheets);
  const books = useBookshelf((s) => s.books);
  const completions = useBingos((s) => s.completions);
  const manualDays = useReadingStreak((s) => s.manualDays);

  return useMemo(() => {
    const sheetsCount = Object.keys(sheets).length;
    const booksRead = books.filter((b) => b.status === 'read').length;
    // Un bingo "complété" = au moins une ligne gagnante (5 cases alignées :
    // ligne, colonne ou diagonale). Chaque bingo compte au plus une fois.
    let bingoCompletedCount = 0;
    for (const cs of Object.values(completions)) {
      const cells = new Set<number>(cs.map((c) => c.cellIndex));
      if (hasAnyWin(cells)) bingoCompletedCount += 1;
    }
    const streakMax = maxConsecutiveDays(manualDays);
    return { sheetsCount, booksRead, bingoCompletedCount, streakMax };
  }, [sheets, books, completions, manualDays]);
}

export function useBadgeUnlockDetector() {
  const stats = useBadgeStats();
  const unlockMany = useBadgesStore((s) => s.unlockMany);
  const enqueue = useBadgeToasts((s) => s.enqueue);
  const firstRun = useRef(true);

  useEffect(() => {
    const target = computeEarnedKeys(stats);
    const fresh = unlockMany(target);
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (fresh.length === 0) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    enqueue(fresh);
  }, [stats, unlockMany, enqueue]);
}
