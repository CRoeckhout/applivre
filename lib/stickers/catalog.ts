import type { ImageSourcePropType } from 'react-native';

// Définition d'un sticker dispo dans le catalog. Source PNG via `source` OU
// SVG inline via `svgXml`. `imageSize` est obligatoire — il fixe l'aspect
// ratio du placement (la largeur effective d'un sticker posé est dérivée
// de sa scale × largeur naturelle, hauteur reconstituée par AR).
export type StickerDef = {
  id: string;
  label: string;
  source?: ImageSourcePropType;
  svgXml?: string;
  imageSize: { width: number; height: number };
  // Tokens de couleur pour SVG : map `name → sentinelHex`. Le SVG contient
  // les hex sentinelles literal ; au runtime, `name` est résolu contre les
  // userPrefs / theme via `applyTokens` (cf. cadres/fonds — même mécanisme).
  tokens?: Record<string, string>;
};

// Pas de catalog statique : les stickers viennent tous de la DB. Aucun n'est
// "embarqué" dans le bundle (à la différence du sentinel 'none' des fonds —
// les stickers n'ont pas de notion d'absence, on n'en place pas si on n'en
// veut pas).
export const STICKERS: StickerDef[] = [];

// Limite stricte de stickers placés sur une fiche. Au-delà, le picker bloque
// l'ajout (UX qui couvre aussi un cap perf : chaque sticker a son propre
// gesture detector + reanimated values).
export const MAX_STICKERS_PER_SHEET = 20;

// Largeur naturelle d'un sticker posé à scale = 1, en pixels (= dp logique
// React Native). Constante absolue : un sticker garde la même taille visuelle
// quel que soit la largeur de la fiche / device. Seule sa POSITION (x, y)
// est stockée en relatif (fraction de la fiche) pour rester ancrée si la
// fiche change de taille. La hauteur est dérivée de l'AR de la source.
export const STICKER_NATURAL_WIDTH = 100;

// Bornes du multiplicateur de scale. 0.25 = quart de la naturelle, 4 =
// quasi-pleine fiche. Empêche le user de dégénérer le placement (sticker
// invisible ou hors champ).
export const STICKER_SCALE_MIN = 0.25;
export const STICKER_SCALE_MAX = 4;
