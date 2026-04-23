import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// Flag global pilotant les panneaux de debug in-app (détail livre etc.).
// Togglable depuis le menu dev RN (Cmd+D / shake) en __DEV__.
type DebugState = {
  panelsEnabled: boolean;
  togglePanels: () => void;
  setPanelsEnabled: (value: boolean) => void;
};

export const useDebug = create<DebugState>()(
  persist(
    (set) => ({
      panelsEnabled: true,
      togglePanels: () => set((s) => ({ panelsEnabled: !s.panelsEnabled })),
      setPanelsEnabled: (value) => set({ panelsEnabled: value }),
    }),
    {
      name: 'applivre-debug',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
