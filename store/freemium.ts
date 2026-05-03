import { supabase } from '@/lib/supabase';
import { create } from 'zustand';

// Limites du plan freemium, lues depuis la table singleton `freemium_settings`
// (id = 1). Pilotées par l'admin (section Abonnements). Fetch au boot ; les
// fallbacks ci-dessous sont les valeurs DB par défaut, utilisés tant que le
// fetch n'a pas eu lieu pour ne pas bloquer l'UI au démarrage.

const DEFAULT_MAX_SHEETS = 25;
const DEFAULT_MAX_ACTIVE_BINGOS = 1;

type FreemiumState = {
  maxSheets: number;
  maxActiveBingos: number;
  loaded: boolean;
  fetch: () => Promise<void>;
};

export const useFreemium = create<FreemiumState>((set) => ({
  maxSheets: DEFAULT_MAX_SHEETS,
  maxActiveBingos: DEFAULT_MAX_ACTIVE_BINGOS,
  loaded: false,
  fetch: async () => {
    const { data, error } = await supabase
      .from('freemium_settings')
      .select('max_sheets, max_active_bingos')
      .eq('id', 1)
      .maybeSingle();
    if (error) {
      console.warn('[freemium] fetch failed', error.message);
      set({ loaded: true });
      return;
    }
    if (data) {
      set({
        maxSheets: data.max_sheets,
        maxActiveBingos: data.max_active_bingos,
        loaded: true,
      });
    } else {
      set({ loaded: true });
    }
  },
}));
