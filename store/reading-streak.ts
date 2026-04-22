import { getSyncUserId } from '@/lib/sync/session';
import { syncDeleteStreakDay, syncUpsertStreakDay } from '@/lib/sync/writers';
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
        if (currentlySet) void syncDeleteStreakDay(day, userId);
        else void syncUpsertStreakDay(day, userId);
      },
      hasManualDay: (day) => get().manualDays.includes(day),
    }),
    {
      name: 'applivre-streak',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
