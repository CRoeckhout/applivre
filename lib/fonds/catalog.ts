import type { ImageSourcePropType } from 'react-native';

export type FondRepeatMode = 'cover' | 'tile';

export type FondDef = {
  id: string;
  label: string;
  // `source` (PNG) ou `svgXml` (SVG inline) ; au moins l'un des deux pour
  // qu'un fond soit rendu. Aucun ⇒ passthrough (pas de fond).
  source?: ImageSourcePropType;
  svgXml?: string;
  imageSize?: { width: number; height: number };
  // `cover` (default) étire l'image en couvrant la surface, crop center si
  // l'AR diffère. `tile` répète le motif en tile entier (count tile arrondi
  // sur chaque axe pour rentrer pile, façon CSS background-repeat: round).
  repeat?: FondRepeatMode;
  // Tokens de couleur pour SVG : map `name → sentinelHex`. Le SVG contient
  // les hex sentinelles literal ; à l'app, `name` est résolu contre les
  // userPrefs / theme via `applyTokens`.
  tokens?: Record<string, string>;
};

// Catalog local. Les fonds réels viennent de la DB (table `fond_catalog`).
// Seule l'option "aucun fond" est dispo localement comme sentinel par défaut.
export const FONDS: FondDef[] = [
  { id: 'none', label: 'Aucun fond' },
];

// Pas de fond. Les nouveaux users démarrent ici. Pour utiliser un fond,
// l'utilisateur doit le sélectionner dans le perso parmi ceux disponibles
// (= fonds `is_default = true` côté catalog OU fonds unlock via user_fonds).
export const DEFAULT_FOND_ID = 'none';

export function getFond(id: string): FondDef {
  return FONDS.find((f) => f.id === id) ?? FONDS[0];
}
