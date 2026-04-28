import { APP_SLUG } from '@/constants/app';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type ProfileState = {
  username: string | null;
  setUsername: (name: string | null) => void;
};

export const useProfile = create<ProfileState>()(
  persist(
    (set) => ({
      username: null,
      setUsername: (name) => set({ username: name?.trim() || null }),
    }),
    {
      name: `${APP_SLUG}-profile`,
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
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
