import { DEFAULT_APPEARANCE, DEFAULT_CATEGORIES, DEFAULT_RATING_ICONS } from '@/lib/sheet-appearance';
import type { SheetAppearance } from '@/types/book';

export type SheetPreset = {
  id: string;
  label: string;
  appearance: SheetAppearance;
};

// Presets livrés avec l'app. IDs préfixés `builtin:` pour les distinguer
// des presets créés par l'user (persistés dans le store).
export const BUILTIN_PRESETS: SheetPreset[] = [
  {
    id: 'builtin:papier',
    label: 'Papier',
    appearance: DEFAULT_APPEARANCE,
  },
  {
    id: 'builtin:journal',
    label: 'Journal vintage',
    appearance: {
      ...DEFAULT_APPEARANCE,
      fontId: 'lora',
      bgColor: '#f3ead8',
      textColor: '#2b211a',
      mutedColor: '#7a6650',
      accentColor: '#8a4b2c',
      frame: { style: 'double', width: 3, color: '#8a4b2c', radius: 4 },
      ratingIcons: DEFAULT_RATING_ICONS,
      defaultCategories: DEFAULT_CATEGORIES,
    },
  },
  {
    id: 'builtin:carnet',
    label: 'Carnet manuscrit',
    appearance: {
      ...DEFAULT_APPEARANCE,
      fontId: 'caveat',
      bgColor: '#fbf6ea',
      textColor: '#24211a',
      mutedColor: '#8a7a63',
      accentColor: '#b4553a',
      frame: { style: 'dashed', width: 2, color: '#8a7a63', radius: 12 },
    },
  },
  {
    id: 'builtin:neon',
    label: 'Néon',
    appearance: {
      ...DEFAULT_APPEARANCE,
      fontId: 'orbitron',
      bgColor: '#11131a',
      textColor: '#e7ecff',
      mutedColor: '#8791b0',
      accentColor: '#5ee1c1',
      frame: { style: 'solid', width: 2, color: '#5ee1c1', radius: 20 },
    },
  },
  {
    id: 'builtin:gothique',
    label: 'Gothique',
    appearance: {
      ...DEFAULT_APPEARANCE,
      fontId: 'unifraktur',
      bgColor: '#f1ece2',
      textColor: '#1c160f',
      mutedColor: '#6b5a48',
      accentColor: '#5b2f27',
      frame: { style: 'double', width: 4, color: '#1c160f', radius: 2 },
    },
  },
  {
    id: 'builtin:terminal',
    label: 'Terminal',
    appearance: {
      ...DEFAULT_APPEARANCE,
      fontId: 'space-mono',
      bgColor: '#0f1012',
      textColor: '#c6facd',
      mutedColor: '#6a846f',
      accentColor: '#9fffb0',
      frame: { style: 'dotted', width: 2, color: '#6a846f', radius: 6 },
    },
  },
];
