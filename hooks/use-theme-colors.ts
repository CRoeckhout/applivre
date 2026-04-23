import { derivePalette, rgbToHex, type DerivedTriplets } from '@/lib/theme/colors';
import { usePreferences } from '@/store/preferences';
import { useMemo } from 'react';

export type ThemeColors = {
  paper: string;
  paperWarm: string;
  paperShade: string;
  ink: string;
  inkSoft: string;
  inkMuted: string;
  accent: string;
  accentDeep: string;
  accentPale: string;
};

function tripletToHex(triplet: string): string {
  const [r, g, b] = triplet.split(/\s+/).map((n) => Number.parseInt(n, 10));
  return rgbToHex([r ?? 0, g ?? 0, b ?? 0]);
}

const KEYS: { key: keyof ThemeColors; css: keyof DerivedTriplets }[] = [
  { key: 'paper', css: '--color-paper' },
  { key: 'paperWarm', css: '--color-paper-warm' },
  { key: 'paperShade', css: '--color-paper-shade' },
  { key: 'ink', css: '--color-ink' },
  { key: 'inkSoft', css: '--color-ink-soft' },
  { key: 'inkMuted', css: '--color-ink-muted' },
  { key: 'accent', css: '--color-accent' },
  { key: 'accentDeep', css: '--color-accent-deep' },
  { key: 'accentPale', css: '--color-accent-pale' },
];

// Retourne la palette du thème courant en hex, utilisable par les APIs RN
// qui n'acceptent pas les classes Tailwind (MaterialIcons color prop, etc.).
export function useThemeColors(): ThemeColors {
  const primary = usePreferences((s) => s.colorPrimary);
  const secondary = usePreferences((s) => s.colorSecondary);
  const bg = usePreferences((s) => s.colorBg);

  return useMemo(() => {
    const palette = derivePalette(primary, secondary, bg);
    const out = {} as ThemeColors;
    for (const { key, css } of KEYS) {
      out[key] = tripletToHex(palette[css]);
    }
    return out;
  }, [primary, secondary, bg]);
}
