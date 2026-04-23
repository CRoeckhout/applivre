import type { FontId } from './fonts';

export type ThemeDef = {
  id: string;
  label: string;
  description: string;
  fontId: FontId;
  primary: string;
  secondary: string;
  bg: string;
};

// Thème créé par l'utilisateur, stocké dans ses préférences.
export type CustomTheme = {
  id: string; // uuid, préfixé "custom:" dans themeId pour différencier
  label: string;
  fontId: FontId;
  primary: string;
  secondary: string;
  bg: string;
};

export const CUSTOM_THEME_PREFIX = 'custom:';

export function customThemeId(id: string): string {
  return `${CUSTOM_THEME_PREFIX}${id}`;
}

export function isCustomThemeId(themeId: string): boolean {
  return themeId.startsWith(CUSTOM_THEME_PREFIX);
}

export function extractCustomId(themeId: string): string | null {
  return isCustomThemeId(themeId) ? themeId.slice(CUSTOM_THEME_PREFIX.length) : null;
}

export const THEMES: ThemeDef[] = [
  {
    id: 'papier',
    label: 'Papier',
    description: 'Chaud et naturel',
    fontId: 'dm-sans',
    primary: '#c27b52',
    secondary: '#1a1410',
    bg: '#fbf8f4',
  },
  {
    id: 'classique',
    label: 'Classique',
    description: 'Serif intemporel',
    fontId: 'lora',
    primary: '#8a5a3b',
    secondary: '#2b1e14',
    bg: '#f6efe2',
  },
  {
    id: 'nuit',
    label: 'Nuit',
    description: 'Lecture en soirée',
    fontId: 'dm-sans',
    primary: '#e0a978',
    secondary: '#ede4d3',
    bg: '#1a1410',
  },
  {
    id: 'ocean',
    label: 'Océan',
    description: 'Bleu profond',
    fontId: 'dm-sans',
    primary: '#3a8fb7',
    secondary: '#0d2633',
    bg: '#eef5f8',
  },
  {
    id: 'foret',
    label: 'Forêt',
    description: 'Vert organique',
    fontId: 'lora',
    primary: '#4a7a44',
    secondary: '#1c2a1a',
    bg: '#f0efe4',
  },
  {
    id: 'carnet',
    label: 'Carnet',
    description: 'Journal manuscrit',
    fontId: 'caveat',
    primary: '#9b5a38',
    secondary: '#2b221a',
    bg: '#f7f1e1',
  },
  {
    id: 'grimoire',
    label: 'Grimoire',
    description: 'Gothique sombre',
    fontId: 'unifraktur',
    primary: '#b88a3a',
    secondary: '#e9d9b4',
    bg: '#1a1410',
  },
  {
    id: 'neon',
    label: 'Neon',
    description: 'Cyberpunk rétro',
    fontId: 'orbitron',
    primary: '#ff4fcd',
    secondary: '#dbe8ff',
    bg: '#0d0820',
  },
  {
    id: 'terminal',
    label: 'Terminal',
    description: 'Console verte',
    fontId: 'space-mono',
    primary: '#2bd67b',
    secondary: '#b8ffcd',
    bg: '#0a120c',
  },
];

export const DEFAULT_THEME_ID = 'papier';

export function getTheme(id: string): ThemeDef {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}
