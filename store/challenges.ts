import { getSyncUserId } from '@/lib/sync/session';
import { syncDeleteChallenge, syncUpsertChallenge } from '@/lib/sync/writers';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type Challenge = {
  year: number;
  target: number;
};

type ChallengesState = {
  challenges: Record<number, Challenge>;
  setTarget: (year: number, target: number) => void;
  clearTarget: (year: number) => void;
};

export const useChallenges = create<ChallengesState>()(
  persist(
    (set) => ({
      challenges: {},
      setTarget: (year, target) => {
        const challenge: Challenge = {
          year,
          target: Math.max(1, Math.floor(target)),
        };
        set((state) => ({
          challenges: { ...state.challenges, [year]: challenge },
        }));
        const userId = getSyncUserId();
        if (userId) void syncUpsertChallenge(challenge, userId);
      },
      clearTarget: (year) => {
        set((state) => {
          const { [year]: _, ...rest } = state.challenges;
          return { challenges: rest };
        });
        const userId = getSyncUserId();
        if (userId) void syncDeleteChallenge(year, userId);
      },
    }),
    {
      name: 'applivre-challenges',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
