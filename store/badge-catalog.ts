import { APP_SLUG } from '@/constants/app';
import type { BadgeCatalogEntry } from '@/types/badge';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// Mirror local du catalog serveur (public.badge_catalog).
// Pull au login via lib/sync/pull. Persisté pour que les badges déjà
// vus restent rendus en mode offline. Inclut les badges retirés (les
// users qui les ont obtenus avant le retrait doivent encore voir le visuel).

type State = {
  entries: Record<string, BadgeCatalogEntry>;
  setAll: (list: BadgeCatalogEntry[]) => void;
  reset: () => void;
};

export const useBadgeCatalog = create<State>()(
  persist(
    (set) => ({
      entries: {},
      setAll: (list) =>
        set({ entries: Object.fromEntries(list.map((e) => [e.badgeKey, e])) }),
      reset: () => set({ entries: {} }),
    }),
    {
      name: `${APP_SLUG}-badge-catalog`,
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
