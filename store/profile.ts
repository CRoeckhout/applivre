import { APP_SLUG } from '@/constants/app';
import { getSyncUserId } from '@/lib/sync/session';
import { syncUpsertAvatarUrl } from '@/lib/sync/writers';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type ProfileState = {
  username: string | null;
  avatarUrl: string | null;
  setUsername: (name: string | null) => void;
  setAvatarUrl: (url: string | null) => void;
};

export const useProfile = create<ProfileState>()(
  persist(
    (set) => ({
      username: null,
      avatarUrl: null,
      setUsername: (name) => set({ username: name?.trim() || null }),
      setAvatarUrl: (url) => {
        const next = url?.trim() || null;
        set({ avatarUrl: next });
        const userId = getSyncUserId();
        if (userId) void syncUpsertAvatarUrl(userId, next);
      },
    }),
    {
      name: `${APP_SLUG}-profile`,
      version: 2,
      storage: createJSONStorage(() => AsyncStorage),
      migrate: (persisted: unknown, version: number) => {
        // v1 → v2 : ajoute avatarUrl. Avant, l'avatar vivait dans
        // preferences.avatarUrl ; ici on initialise à null (le pull au login
        // hydratera la valeur depuis profiles.avatar_url côté serveur).
        const prev = (persisted ?? {}) as Partial<ProfileState>;
        if (version < 2) {
          return { username: prev.username ?? null, avatarUrl: null };
        }
        return prev;
      },
    },
  ),
);

// Règles de validation côté client (complétées par un check RPC côté serveur).
const USERNAME_RE = /^[a-z0-9._]+$/i;

export function validateUsernameLocal(input: string): string | null {
  const t = input.trim();
  if (t.length < 3) return 'Au moins 3 caractères';
  if (t.length > 30) return '30 caractères maximum';
  if (!USERNAME_RE.test(t)) return 'Lettres, chiffres, _ et . uniquement';
  return null;
}
