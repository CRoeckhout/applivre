import { APP_SLUG } from '@/constants/app';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// Préférence utilisateur pour la musique d'ambiance pendant les sessions de
// lecture. On persiste le thème choisi + l'index de piste pour qu'une nouvelle
// session reprenne automatiquement le même thème (et la même piste si l'app
// est relancée pendant qu'une session est active).
//
// Les champs préfixés `engine_` sont écrits par le `ReadingMusicEngine` (un
// composant unique mounté au root) — ils ne sont pas persistés et reflètent
// l'état du player en runtime (queue length, statut de chargement, titre de
// la piste courante). Le panel lit le store, l'engine pilote le player.

export type ReadingMusicStatusKind =
  | 'idle'
  | 'loading'
  | 'downloading'
  | 'ready'
  | 'unavailable_offline'
  | 'error';

type ReadingMusicState = {
  // Persisté
  selectedThemeKey: string | null;
  currentTrackIndex: number;

  // Runtime — synchronisé depuis l'engine
  isPlaying: boolean;
  trackCount: number;
  currentTrackTitle: string | null;
  statusKind: ReadingMusicStatusKind;
  statusError: string | null;
  statusDownloadDone: number;
  statusDownloadTotal: number;

  // Actions — utilisateur
  setTheme: (key: string | null) => void;
  setIsPlaying: (playing: boolean) => void;
  togglePlay: () => void;
  next: () => void;
  prev: () => void;
  clearTheme: () => void;

  // Actions — engine (interne, ne pas appeler depuis l'UI)
  _engineSetTrackIndex: (index: number) => void;
  _engineSetTrackCount: (count: number) => void;
  _engineSetCurrentTitle: (title: string | null) => void;
  _engineSetStatus: (
    kind: ReadingMusicStatusKind,
    extra?: { error?: string | null; done?: number; total?: number },
  ) => void;
};

export const useReadingMusicStore = create<ReadingMusicState>()(
  persist(
    (set, get) => ({
      selectedThemeKey: null,
      currentTrackIndex: 0,

      isPlaying: false,
      trackCount: 0,
      currentTrackTitle: null,
      statusKind: 'idle',
      statusError: null,
      statusDownloadDone: 0,
      statusDownloadTotal: 0,

      setTheme: (key) => {
        const prev = get().selectedThemeKey;
        if (prev === key) return;
        set({ selectedThemeKey: key, currentTrackIndex: 0 });
      },
      setIsPlaying: (playing) => set({ isPlaying: playing }),
      togglePlay: () => set({ isPlaying: !get().isPlaying }),
      next: () => {
        const { trackCount, currentTrackIndex } = get();
        if (trackCount === 0) return;
        set({
          currentTrackIndex: (currentTrackIndex + 1) % trackCount,
        });
      },
      prev: () => {
        const { trackCount, currentTrackIndex } = get();
        if (trackCount === 0) return;
        set({
          currentTrackIndex:
            (currentTrackIndex - 1 + trackCount) % trackCount,
        });
      },
      clearTheme: () =>
        set({
          selectedThemeKey: null,
          currentTrackIndex: 0,
          isPlaying: false,
        }),

      _engineSetTrackIndex: (index) =>
        set({ currentTrackIndex: Math.max(0, index) }),
      _engineSetTrackCount: (count) => set({ trackCount: Math.max(0, count) }),
      _engineSetCurrentTitle: (title) => set({ currentTrackTitle: title }),
      _engineSetStatus: (kind, extra) =>
        set({
          statusKind: kind,
          statusError: extra?.error ?? null,
          statusDownloadDone: extra?.done ?? 0,
          statusDownloadTotal: extra?.total ?? 0,
        }),
    }),
    {
      name: `${APP_SLUG}-reading-music`,
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        selectedThemeKey: s.selectedThemeKey,
        currentTrackIndex: s.currentTrackIndex,
      }),
    },
  ),
);
