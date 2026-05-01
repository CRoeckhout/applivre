// Re-export depuis le module générique. `applyBorderTokens` est conservé
// pour les imports existants ; nouveau code (cadres ou fonds) peut consommer
// `applyTokens` directement depuis `lib/decorations/tokens`.
export { applyTokens as applyBorderTokens } from '@/lib/decorations/tokens';
export type { DecorationColorPrefs as BorderColorPrefs } from '@/lib/decorations/tokens';
