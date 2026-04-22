import { getSyncUserId } from '@/lib/sync/session';
import { syncUpsertPreferences } from '@/lib/sync/writers';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type HomeCardId = 'library' | 'sheets' | 'defi';

export const AVAILABLE_HOME_CARDS: HomeCardId[] = ['library', 'sheets', 'defi'];

export type Preferences = {
  dailyReadingGoalMinutes: number;
  homeCardOrder: HomeCardId[];
  avatarUrl: string | null;
};

export const DEFAULT_PREFERENCES: Preferences = {
  dailyReadingGoalMinutes: 10,
  homeCardOrder: [...AVAILABLE_HOME_CARDS],
  avatarUrl: null,
};

type PreferencesState = Preferences & {
  setDailyReadingGoalMinutes: (minutes: number) => void;
  setHomeCardOrder: (order: HomeCardId[]) => void;
  setAvatarUrl: (url: string | null) => void;
  resetToDefaults: () => void;
};

function clampMinutes(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_PREFERENCES.dailyReadingGoalMinutes;
  return Math.max(1, Math.min(180, Math.floor(n)));
}

// Supabase.upsert sur la colonne JSONB `preferences` remplace la valeur entière.
// Donc toute sync doit envoyer l'ÉTAT COMPLET des préférences, pas seulement
// le champ qui vient de changer — sinon on écrase les autres côté serveur.
function pushFullPrefs(state: Preferences): void {
  const userId = getSyncUserId();
  if (!userId) return;
  void syncUpsertPreferences(userId, {
    dailyReadingGoalMinutes: state.dailyReadingGoalMinutes,
    homeCardOrder: state.homeCardOrder,
    avatarUrl: state.avatarUrl,
  });
}

export const usePreferences = create<PreferencesState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_PREFERENCES,
      setDailyReadingGoalMinutes: (minutes) => {
        const value = clampMinutes(minutes);
        set({ dailyReadingGoalMinutes: value });
        pushFullPrefs(get());
      },
      setHomeCardOrder: (order) => {
        // Ne conserver que les IDs connus, compléter avec les manquants en fin.
        const known = order.filter((id): id is HomeCardId =>
          AVAILABLE_HOME_CARDS.includes(id),
        );
        const missing = AVAILABLE_HOME_CARDS.filter((id) => !known.includes(id));
        const safe = [...known, ...missing];
        set({ homeCardOrder: safe });
        pushFullPrefs(get());
      },
      setAvatarUrl: (url) => {
        set({ avatarUrl: url });
        pushFullPrefs(get());
      },
      resetToDefaults: () => {
        set({ ...DEFAULT_PREFERENCES });
        pushFullPrefs(get());
      },
    }),
    {
      name: 'applivre-preferences',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
