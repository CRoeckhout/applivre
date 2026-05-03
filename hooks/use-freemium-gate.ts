import { useBingos } from '@/store/bingo';
import { useFreemium } from '@/store/freemium';
import { usePremium } from '@/store/premium';
import { useReadingSheets } from '@/store/reading-sheets';

// Centralise les checks de limites freemium côté création (fiches, bingos).
// Les fonctions retournées lisent le state via `getState()` au moment de
// l'appel — pas de subscription aux sheets/bingos pour ne pas re-rendre les
// callers à chaque mutation. Les sources de limites (premium + settings)
// sont en revanche subscribed pour rester réactives quand l'admin change
// la limite ou que le user passe premium.
//
// Utilisation : `if (gate.canCreateSheet()) { ... } else { openPaywall(); }`.
export function useFreemiumGate() {
  const isPremium = usePremium((s) => s.isPremium);
  const maxSheets = useFreemium((s) => s.maxSheets);
  const maxActiveBingos = useFreemium((s) => s.maxActiveBingos);

  return {
    canCreateSheet(): boolean {
      if (isPremium) return true;
      const { sheets } = useReadingSheets.getState();
      // Pas de soft-delete sur reading_sheets : `removeSheet` purge la row
      // du store, donc le compte = simplement le nombre d'entries.
      return Object.keys(sheets).length < maxSheets;
    },
    canCreateBingo(): boolean {
      if (isPremium) return true;
      const { bingos } = useBingos.getState();
      // "Non terminé" = brouillon (savedAt absent) ou en cours (savedAt
      // présent mais pas archivedAt). Les bingos archivés ne comptent pas.
      const activeCount = bingos.filter((b) => !b.archivedAt).length;
      return activeCount < maxActiveBingos;
    },
  };
}
