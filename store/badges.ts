import { getSyncUserId } from '@/lib/sync/session';
import { syncUpsertUserBadge } from '@/lib/sync/writers';
import type { BadgeKey } from '@/types/badge';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type BadgesState = {
  earned: Record<BadgeKey, string>;
  unlock: (key: BadgeKey, when?: string) => boolean;
  unlockMany: (keys: BadgeKey[]) => BadgeKey[];
  reset: () => void;
};

export const useBadges = create<BadgesState>()(
  persist(
    (set, get) => ({
      earned: {},
      unlock: (key, when) => {
        if (get().earned[key]) return false;
        const at = when ?? new Date().toISOString();
        set((s) => ({ earned: { ...s.earned, [key]: at } }));
        const userId = getSyncUserId();
        if (userId) void syncUpsertUserBadge(userId, key, at);
        return true;
      },
      unlockMany: (keys) => {
        const cur = get().earned;
        const fresh = keys.filter((k) => !cur[k]);
        if (fresh.length === 0) return [];
        const at = new Date().toISOString();
        const next = { ...cur };
        for (const k of fresh) next[k] = at;
        set({ earned: next });
        const userId = getSyncUserId();
        if (userId) {
          for (const k of fresh) void syncUpsertUserBadge(userId, k, at);
        }
        return fresh;
      },
      reset: () => set({ earned: {} }),
    }),
    {
      name: 'applivre-badges',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
