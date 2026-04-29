import { useBadgeCatalog } from '@/store/badge-catalog';
import { useBadges } from '@/store/badges';
import { useBookshelf } from '@/store/bookshelf';
import { useChallenges } from '@/store/challenges';
import { useLoans } from '@/store/loans';
import { DEFAULT_PREFERENCES, usePreferences } from '@/store/preferences';
import { useProfile } from '@/store/profile';
import { useReadingSheets } from '@/store/reading-sheets';
import { useReadingStreak } from '@/store/reading-streak';
import { useSyncQueue } from '@/store/sync-queue';
import { useTimer } from '@/store/timer';

export function resetAllStores(): void {
  useBookshelf.setState({ books: [] });
  useTimer.setState({ active: null, sessions: [] });
  useLoans.setState({ loans: [] });
  useReadingSheets.setState({ sheets: {} });
  useChallenges.setState({ challenges: {} });
  useReadingStreak.setState({ manualDays: [] });
  usePreferences.setState({ ...DEFAULT_PREFERENCES });
  useProfile.setState({ username: null, avatarUrl: null });
  useSyncQueue.setState({ ops: [] });
  useBadges.setState({ earned: {} });
  useBadgeCatalog.getState().reset();
}
