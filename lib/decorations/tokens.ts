import type { ThemeColors } from '@/hooks/use-theme-colors';

// Tokens decoration = map { lookupKey → sentinelHex }. Le SVG est exporté
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
//
// Partagé entre cadres et fonds — tout SVG du catalog (border ou fond) suit
// la même convention de tokens.

export type DecorationColorPrefs = {
  colorPrimary: string;
  colorSecondary: string;
  colorBg: string;
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// `overrides` (optionnel) prennent priorité absolue sur prefs et theme.
// Utilisé par les fiches/bingos pour permettre une override per-instance des
// couleurs d'un cadre/fond SVG sans modifier les userPreferences globales.
export function applyTokens(
  svgXml: string,
  tokens: Record<string, string> | undefined,
  prefs: DecorationColorPrefs,
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
