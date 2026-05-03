import { supabase } from '@/lib/supabase';
import { create } from 'zustand';

// État premium côté client. Phase 2 : lecture seule de `profiles.is_premium`
// + `premium_until` (toggle manuel via SQL en attendant). Phase 3 : RevenueCat
// devient la source de vérité ; webhook RC → Edge Function → écrit `profiles`.
// Le client lira ici la même colonne, alimentée par RC pour les vrais users.

type PremiumState = {
  isPremium: boolean;
  // Date d'expiration côté serveur. Null si pas d'abonnement actif. Permet
  // d'afficher un compte à rebours / message d'expiration côté UX.
  premiumUntil: Date | null;
  loaded: boolean;
  fetch: (userId: string | null) => Promise<void>;
  reset: () => void;
};

export const usePremium = create<PremiumState>((set) => ({
  isPremium: false,
  premiumUntil: null,
  loaded: false,
  fetch: async (userId) => {
    if (!userId) {
      set({ isPremium: false, premiumUntil: null, loaded: true });
      return;
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('is_premium, premium_until')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      console.warn('[premium] fetch failed', error.message);
      // Conserve l'état précédent ; ne pas downgrade en non-premium par
      // erreur réseau. `loaded` reste à son état pour que le reste de l'UI
      // n'attende pas indéfiniment au cas où ce serait le premier fetch.
      set({ loaded: true });
      return;
    }
    const row = data as { is_premium: boolean; premium_until: string | null } | null;
    set({
      isPremium: row?.is_premium ?? false,
      premiumUntil: row?.premium_until ? new Date(row.premium_until) : null,
      loaded: true,
    });
  },
  reset: () => set({ isPremium: false, premiumUntil: null, loaded: false }),
}));
