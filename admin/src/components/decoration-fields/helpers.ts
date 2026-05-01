export type DecorationKind = 'png_9slice' | 'svg_9slice' | 'lottie_9slice';

export type TokenLabelEntry = { name: string; label: string };

// Doit rester aligné avec `TOKEN_LABELS` côté app
// (components/sheet-customizer.tsx). Si on ajoute un slot ici, mirror l'app —
// sinon l'admin pourra créer un token que les users ne sauront pas nommer.
export const TOKEN_LABELS: TokenLabelEntry[] = [
  { name: 'colorPrimary', label: 'Couleur principale' },
  { name: 'colorSecondary', label: 'Couleur secondaire' },
  { name: 'colorBg', label: 'Fond' },
  { name: 'paper', label: 'Fond' },
  { name: 'paperWarm', label: 'Fond chaud' },
  { name: 'paperShade', label: 'Fond ombré' },
  { name: 'ink', label: 'Texte' },
  { name: 'inkSoft', label: 'Texte adouci' },
  { name: 'inkMuted', label: 'Texte discret' },
  { name: 'accent', label: 'Accent' },
  { name: 'accentDeep', label: 'Accent foncé' },
  { name: 'accentPale', label: 'Accent pâle' },
];

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Mirror minimal de `applyTokens` côté app : remplace chaque sentinel hex
// défini dans `tokens` par la couleur choisie dans `overrides`. Les tokens
// sans override sont laissés tels quels (= sentinel d'origine du SVG).
export function applySvgPreviewOverrides(
  svgText: string | null,
  tokens: Record<string, string>,
  overrides: Record<string, string>,
): string | null {
  if (!svgText) return null;
  let out = svgText;
  for (const [name, sentinel] of Object.entries(tokens)) {
    const replacement = overrides[name];
    if (!replacement || !sentinel) continue;
    out = out.replace(new RegExp(escapeRegex(sentinel), 'gi'), replacement);
  }
  return out;
}

// Lit width/height intrinsèques d'un SVG : preference au viewBox (référence
// de coords du content), fallback sur les attributs width/height de la racine.
// Renvoie null si rien d'exploitable — l'admin devra saisir à la main.
export function extractSvgDims(svgText: string): { w: number; h: number } | null {
  const tagMatch = svgText.match(/<svg\b[^>]*>/i);
  if (!tagMatch) return null;
  const tag = tagMatch[0];
  const vbMatch = tag.match(/\bviewBox\s*=\s*"([^"]+)"/i);
  if (vbMatch) {
    const parts = vbMatch[1].trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite)) {
      const w = Math.round(parts[2]);
      const h = Math.round(parts[3]);
      if (w > 0 && h > 0) return { w, h };
    }
  }
  const wMatch = tag.match(/\bwidth\s*=\s*"([\d.]+)/i);
  const hMatch = tag.match(/\bheight\s*=\s*"([\d.]+)/i);
  if (wMatch && hMatch) {
    const w = Math.round(Number.parseFloat(wMatch[1]));
    const h = Math.round(Number.parseFloat(hMatch[1]));
    if (w > 0 && h > 0) return { w, h };
  }
  return null;
}

export function parseOptInt(s: string): number | null {
  const t = s.trim();
  if (t === '') return null;
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
