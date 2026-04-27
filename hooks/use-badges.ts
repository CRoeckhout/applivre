import { runBadgeEval } from '@/lib/sync/eval-badges';
import { useEffect } from 'react';
import { AppState } from 'react-native';

// Force une réévaluation des badges côté serveur quand l'app revient au
// foreground. Couplé avec l'eval debouncée déclenchée par les writers,
// cela couvre :
//  - les unlocks suite à des actions locales (déclenchés par writers)
//  - les unlocks dont la condition est temporelle (badges saisonniers
//    activés/expirés pendant que l'app était en background)
//  - les unlocks faits depuis un autre appareil qui apparaissent au retour
export function useBadgeForegroundEval(): void {
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void runBadgeEval();
    });
    return () => sub.remove();
  }, []);
}
