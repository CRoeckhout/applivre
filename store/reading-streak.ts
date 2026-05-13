import { APP_SLUG } from '@/constants/app';
import { isDayAutoValidated } from '@/lib/streak-validation';
import { getSyncUserId } from '@/lib/sync/session';
import { syncDeleteStreakDay, syncUpsertStreakDay } from '@/lib/sync/writers';
import { usePreferences } from '@/store/preferences';
import { useTimer } from '@/store/timer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// Les jours cochés manuellement. La validation "10 min" se fait en plus via
// les sessions du timer, dérivée côté composant.

type StreakState = {
  manualDays: string[]; // ISO YYYY-MM-DD
  toggleDay: (day: string) => void;
  hasManualDay: (day: string) => boolean;
};

export const useReadingStreak = create<StreakState>()(
  persist(
    (set, get) => ({
      manualDays: [],
      toggleDay: (day) => {
        const currentlySet = get().manualDays.includes(day);
        set((state) => ({
          manualDays: currentlySet
            ? state.manualDays.filter((d) => d !== day)
            : [...state.manualDays, day],
        }));
        const userId = getSyncUserId();
        if (!userId) return;
        if (currentlySet) {
          // Si le jour est encore auto-validé par les sessions, on garde la
          // row côté serveur. Sinon, on la supprime.
          const goalMinutes = usePreferences.getState().dailyReadingGoalMinutes;
          const sessions = useTimer.getState().sessions;
          if (isDayAutoValidated(sessions, day, goalMinutes)) return;
          void syncDeleteStreakDay(day, userId);
        } else {
          const goalMinutes = usePreferences.getState().dailyReadingGoalMinutes;
          void syncUpsertStreakDay(day, userId, goalMinutes);
        }
      },
      hasManualDay: (day) => get().manualDays.includes(day),
    }),
    {
      name: `${APP_SLUG}-streak`,
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
