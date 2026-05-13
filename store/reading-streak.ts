import { APP_SLUG } from '@/constants/app';
import { isDayAutoValidated } from '@/lib/streak-validation';
import { getSyncUserId } from '@/lib/sync/session';
import {
  syncDeleteStreakDay,
  syncEnsureStreakDayAuto,
  syncUpsertStreakDay,
} from '@/lib/sync/writers';
import { usePreferences } from '@/store/preferences';
import { useTimer } from '@/store/timer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// Une row par jour validé. `manual=true` quand le jour est validé par un
// toggle utilisateur ; `manual=false` quand il l'est par une session de
// lecture qui atteint l'objectif quotidien. Source de vérité = DB.
export type StreakDay = { day: string; manual: boolean };

type StreakState = {
  days: StreakDay[];
  // Toggle UI : crée une row manuelle, ou la rétrograde/supprime selon
  // qu'une session valide encore le jour.
  toggleDay: (day: string) => void;
  // Hook timer : une session vient de valider le jour. Crée une row auto
  // si rien n'existe (préserve un manual=true existant).
  ensureAutoDay: (day: string, goalMinutes: number) => void;
  // Hook timer : une session supprimée laisse le jour sans validation auto.
  // Retire la row si elle était auto-only (préserve manual=true).
  removeAutoDay: (day: string) => void;
  hasDay: (day: string) => boolean;
  isManualDay: (day: string) => boolean;
  isAutoDay: (day: string) => boolean;
};

function addOrUpdate(days: StreakDay[], next: StreakDay): StreakDay[] {
  const idx = days.findIndex((d) => d.day === next.day);
  if (idx === -1) return [...days, next];
  const out = days.slice();
  out[idx] = next;
  return out;
}

export const useReadingStreak = create<StreakState>()(
  persist(
    (set, get) => ({
      days: [],
      toggleDay: (day) => {
        const userId = getSyncUserId();
        const existing = get().days.find((d) => d.day === day);
        const goalMinutes = usePreferences.getState().dailyReadingGoalMinutes;

        if (!existing) {
          // Validation manuelle.
          set((state) => ({
            days: addOrUpdate(state.days, { day, manual: true }),
          }));
          if (userId) {
            void syncUpsertStreakDay(day, userId, goalMinutes, true);
          }
          return;
        }

        // Le jour est déjà validé. L'UI ne devrait laisser l'utilisateur
        // toggle off que si manual=true ; on traite ce cas.
        if (!existing.manual) return;

        const sessions = useTimer.getState().sessions;
        const stillAuto = isDayAutoValidated(sessions, day, goalMinutes);
        if (stillAuto) {
          // Rétrograder en auto plutôt que supprimer.
          set((state) => ({
            days: addOrUpdate(state.days, { day, manual: false }),
          }));
          if (userId) {
            void syncUpsertStreakDay(day, userId, goalMinutes, false);
          }
        } else {
          set((state) => ({
            days: state.days.filter((d) => d.day !== day),
          }));
          if (userId) void syncDeleteStreakDay(day, userId);
        }
      },
      ensureAutoDay: (day, goalMinutes) => {
        const existing = get().days.find((d) => d.day === day);
        if (existing) return; // ne pas écraser un manual=true
        set((state) => ({
          days: addOrUpdate(state.days, { day, manual: false }),
        }));
        const userId = getSyncUserId();
        if (userId) void syncEnsureStreakDayAuto(day, userId, goalMinutes);
      },
      removeAutoDay: (day) => {
        const existing = get().days.find((d) => d.day === day);
        if (!existing || existing.manual) return;
        set((state) => ({
          days: state.days.filter((d) => d.day !== day),
        }));
        const userId = getSyncUserId();
        if (userId) void syncDeleteStreakDay(day, userId);
      },
      hasDay: (day) => get().days.some((d) => d.day === day),
      isManualDay: (day) =>
        get().days.some((d) => d.day === day && d.manual),
      isAutoDay: (day) =>
        get().days.some((d) => d.day === day && !d.manual),
    }),
    {
      name: `${APP_SLUG}-streak`,
      version: 2,
      storage: createJSONStorage(() => AsyncStorage),
      migrate: (persisted, fromVersion) => {
        // v1 : { manualDays: string[] } → v2 : { days: { day, manual: true }[] }
        if (fromVersion < 2 && persisted && typeof persisted === 'object') {
          const raw = (persisted as { manualDays?: unknown }).manualDays;
          const list = Array.isArray(raw)
            ? raw.filter((x): x is string => typeof x === 'string')
            : [];
          return {
            days: list.map((day) => ({ day, manual: true })),
          } as Partial<StreakState>;
        }
        return persisted as Partial<StreakState>;
      },
    },
  ),
);
