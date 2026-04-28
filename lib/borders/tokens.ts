import type { ThemeColors } from '@/hooks/use-theme-colors';

// Tokens cadre = map { lookupKey → sentinelHex }. Le SVG est exporté
// d'Illustrator avec des hex sentinelles (ex: `#FF0000`, `#000000`) ; au
// runtime on remplace chaque sentinel par la valeur correspondante, lue
// soit dans les userPreferences (colorPrimary / colorSecondary / colorBg),
// soit dans les slots dérivés du theme (paper, paperWarm, ink, accent…).
//
// Lookup en cascade : prefs d'abord (3 couleurs brutes), puis theme (9 slots
// dérivés). Permet de référencer le fond exact d'une card via `paperWarm`
// sans avoir à exposer ce slot comme nouvelle user pref.
//
// Pas de placeholder `{{name}}` : on agit directement sur les hex literal
// présents dans le SVG. Comparaison case-insensitive (#FF0000 == #ff0000).

export type BorderColorPrefs = {
  colorPrimary: string;
  colorSecondary: string;
  colorBg: string;
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// `overrides` (optionnel) prennent priorité absolue sur prefs et theme.
// Utilisé par les fiches de lecture pour permettre une override per-fiche
// des couleurs d'un cadre SVG sans modifier les userPreferences globales.
export function applyBorderTokens(
  svgXml: string,
  tokens: Record<string, string> | undefined,
  prefs: BorderColorPrefs,
  theme: ThemeColors,
  overrides?: Record<string, string>,
): string {
  if (!tokens) return svgXml;
  const prefMap = prefs as unknown as Record<string, string | undefined>;
  const themeMap = theme as unknown as Record<string, string | undefined>;
  let out = svgXml;
  for (const [key, sentinel] of Object.entries(tokens)) {
    const replacement = overrides?.[key] ?? prefMap[key] ?? themeMap[key];
    if (!replacement || !sentinel) continue;
    out = out.replace(new RegExp(escapeRegex(sentinel), 'gi'), replacement);
  }
  return out;
}
