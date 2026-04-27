import type { BadgeKey } from '@/types/badge';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// Mirror local des badges débloqués (public.user_badges).
// Source de vérité = serveur. Le store ne fait QUE refléter (merge depuis
// pull ou depuis le retour de l'RPC evaluate_user_badges). Aucune écriture
// directe vers la DB depuis le client : un trigger Postgres rejette tout
// insert non justifié par les stats serveur (lib/sync/eval-badges.ts).

type State = {
  earned: Record<BadgeKey, string>;
  merge: (keys: BadgeKey[], earnedAt: string) => void;
  reset: () => void;
};

export const useBadges = create<State>()(
  persist(
    (set, get) => ({
      earned: {},
      merge: (keys, earnedAt) => {
        const cur = get().earned;
        const fresh = keys.filter((k) => !cur[k]);
        if (fresh.length === 0) return;
        const next = { ...cur };
        for (const k of fresh) next[k] = earnedAt;
        set({ earned: next });
      },
      reset: () => set({ earned: {} }),
    }),
    {
      name: 'applivre-badges',
      version: 2,
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
