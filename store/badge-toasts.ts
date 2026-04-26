import type { BadgeKey } from '@/types/badge';
import { create } from 'zustand';

export type BadgeToast = {
  id: string;
  badgeKey: BadgeKey;
};

type State = {
  queue: BadgeToast[];
  // Compteur de "pauses" demandées par les écrans : tant que > 0, le host
  // de toast ne s'affiche pas. Permet d'enchaîner avec une modale écran
  // (ex : popup victoire bingo) sans superposer.
  paused: number;
  enqueue: (keys: BadgeKey[]) => void;
  dismiss: (id: string) => void;
  pause: () => void;
  resume: () => void;
};

let counter = 0;

export const useBadgeToasts = create<State>((set) => ({
  queue: [],
  paused: 0,
  enqueue: (keys) =>
    set((s) => ({
      queue: [
        ...s.queue,
        ...keys.map((k) => ({ id: `bt-${Date.now()}-${++counter}`, badgeKey: k })),
      ],
    })),
  dismiss: (id) => set((s) => ({ queue: s.queue.filter((t) => t.id !== id) })),
  pause: () => set((s) => ({ paused: s.paused + 1 })),
  resume: () => set((s) => ({ paused: Math.max(0, s.paused - 1) })),
}));
