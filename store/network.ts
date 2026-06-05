import { create } from 'zustand';

// État connectivité réseau, alimenté par initNetworkWatcher (lib/sync/network).
// Exposé en store pour que l'UI (bannière hors ligne, garde du feed) puisse
// réagir. `isOnline` démarre optimiste à true pour éviter un flash hors ligne
// au tout premier render avant que NetInfo ait émis son premier état.
type NetworkState = {
  isOnline: boolean;
  setOnline: (value: boolean) => void;
};

export const useNetwork = create<NetworkState>((set) => ({
  isOnline: true,
  setOnline: (value) => set({ isOnline: value }),
}));

// Sélecteur pratique pour les composants : `const online = useOnline();`
export function useOnline(): boolean {
  return useNetwork((s) => s.isOnline);
}
