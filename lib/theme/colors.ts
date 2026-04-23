export type RGB = [number, number, number];
export type HSL = [number, number, number];

export function hexToRgb(hex: string): RGB | null {
  const h = hex.replace('#', '').trim();
  const clean = h.length === 3
    ? h.split('').map((c) => c + c).join('')
    : h;
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return [r, g, b];
}

export function rgbToHex([r, g, b]: RGB): string {
  const to = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

export function rgbToHsl([r, g, b]: RGB): HSL {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rr:
        h = ((gg - bb) / d + (gg < bb ? 6 : 0)) * 60;
        break;
      case gg:
        h = ((bb - rr) / d + 2) * 60;
        break;
      default:
        h = ((rr - gg) / d + 4) * 60;
    }
  }
  return [h, s * 100, l * 100];
}

export function hslToRgb([h, s, l]: HSL): RGB {
  const ss = s / 100;
  const ll = l / 100;
  const c = (1 - Math.abs(2 * ll - 1)) * ss;
  const hh = (h % 360) / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hh < 1) { r1 = c; g1 = x; }
  else if (hh < 2) { r1 = x; g1 = c; }
  else if (hh < 3) { g1 = c; b1 = x; }
  else if (hh < 4) { g1 = x; b1 = c; }
  else if (hh < 5) { r1 = x; b1 = c; }
  else { r1 = c; b1 = x; }
  const m = ll - c / 2;
  return [
    Math.round((r1 + m) * 255),
    Math.round((g1 + m) * 255),
    Math.round((b1 + m) * 255),
  ];
}

export function rgbTriplet([r, g, b]: RGB): string {
  return `${Math.round(r)} ${Math.round(g)} ${Math.round(b)}`;
}

function adjustLightness(hex: string, delta: number): RGB {
  const rgb = hexToRgb(hex) ?? [0, 0, 0];
  const [h, s, l] = rgbToHsl(rgb);
  return hslToRgb([h, s, Math.max(0, Math.min(100, l + delta))]);
}

export function relativeLuminance([r, g, b]: RGB): number {
  const norm = (v: number) => {
    const n = v / 255;
    return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * norm(r) + 0.7152 * norm(g) + 0.0722 * norm(b);
}

export type DerivedTriplets = {
  '--color-paper': string;
  '--color-paper-warm': string;
  '--color-paper-shade': string;
  '--color-ink': string;
  '--color-ink-soft': string;
  '--color-ink-muted': string;
  '--color-accent': string;
  '--color-accent-deep': string;
  '--color-accent-pale': string;
};

// Dérive la palette complète depuis 3 couleurs utilisateur.
// - bg (paper) : direction warm/shade selon luminance (fond clair ou sombre).
// - ink : text; soft/muted = glissement vers le fond.
// - accent (primary) : deep plus sombre, pale plus clair + désaturé.
export function derivePalette(
  primaryHex: string,
  secondaryHex: string,
  bgHex: string,
): DerivedTriplets {
  const paperRgb = hexToRgb(bgHex) ?? [251, 248, 244];
  const inkRgb = hexToRgb(secondaryHex) ?? [26, 20, 16];
  const accentRgb = hexToRgb(primaryHex) ?? [194, 123, 82];
  const paperLum = relativeLuminance(paperRgb);
  const darkBg = paperLum < 0.35;

  // Paper: warm = léger décalage vers chaud, shade = plus contrasté que warm.
  const paperWarm = darkBg ? adjustLightness(bgHex, +6) : adjustLightness(bgHex, -4);
  const paperShade = darkBg ? adjustLightness(bgHex, +14) : adjustLightness(bgHex, -10);

  // Ink: soft = glissement vers le bg, muted = encore plus.
  const inkLumTarget = darkBg ? +18 : -18;
  const inkSoft = adjustLightness(secondaryHex, inkLumTarget * 0.5);
  const inkMuted = adjustLightness(secondaryHex, inkLumTarget);

  // Accent: deep = plus profond, pale = désaturé + clair.
  const accentDeep = adjustLightness(primaryHex, -12);
  const [ah, as] = rgbToHsl(accentRgb);
  const accentPale = hslToRgb([ah, as * 0.45, 85]);

  return {
    '--color-paper': rgbTriplet(paperRgb),
    '--color-paper-warm': rgbTriplet(paperWarm),
    '--color-paper-shade': rgbTriplet(paperShade),
    '--color-ink': rgbTriplet(inkRgb),
    '--color-ink-soft': rgbTriplet(inkSoft),
    '--color-ink-muted': rgbTriplet(inkMuted),
    '--color-accent': rgbTriplet(accentRgb),
    '--color-accent-deep': rgbTriplet(accentDeep),
    '--color-accent-pale': rgbTriplet(accentPale),
  };
}

export function isValidHex(input: string): boolean {
  const h = input.replace('#', '').trim();
  return /^[0-9a-fA-F]{6}$/.test(h) || /^[0-9a-fA-F]{3}$/.test(h);
}

export function normalizeHex(input: string): string {
  const h = input.replace('#', '').trim().toLowerCase();
  const clean = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return `#${clean}`;
}
