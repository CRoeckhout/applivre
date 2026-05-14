import { APP_SLUG } from '@/constants/app';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// Mémorise la dernière version d'app pour laquelle l'utilisateur a vu (ou
// fermé) la modale "Dernières nouveautés". Sert au trigger de boot dans
// app/_layout.tsx pour ne pas réafficher des notes déjà consultées.
//
// Valeur initiale `null` ⇒ l'user n'a encore rien vu : la RPC
// `get_release_notes_since(null)` renverra tout l'historique disponible
// (comportement choisi pour le premier déploiement de la feature).

type ReleaseNotesState = {
  lastSeenVersion: string | null;
  markSeen: (version: string) => void;
};

export const useReleaseNotesStore = create<ReleaseNotesState>()(
  persist(
    (set) => ({
      lastSeenVersion: null,
      markSeen: (version) => set({ lastSeenVersion: version }),
    }),
    {
      name: `${APP_SLUG}-release-notes`,
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
