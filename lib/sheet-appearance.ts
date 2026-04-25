import type {
  SheetAppearance,
  SheetAppearanceOverride,
  SheetDefaultCategory,
  SheetFrame,
  SheetRatingIconConfig,
  SheetSection,
} from '@/types/book';

export const DEFAULT_FRAME: SheetFrame = {
  style: 'solid',
  width: 0,
  color: '#6b6259',
  radius: 16,
};

export const DEFAULT_RATING_ICONS: SheetRatingIconConfig[] = [
  { kind: 'star', label: 'Étoile', enabled: true },
  { kind: 'heart', label: 'Cœur', enabled: true },
  { kind: 'chili', label: 'Piment', enabled: true },
];

export const DEFAULT_CATEGORIES: SheetDefaultCategory[] = [
  { title: 'Histoire', materialIcon: 'auto-stories', materialIconColor: '#8e5dc8' },
  { title: 'Fin', materialIcon: 'flag', materialIconColor: '#1f1a16' },
  { title: 'Personnages', materialIcon: 'group', materialIconColor: '#4a90c2' },
  { title: 'Romance', materialIcon: 'favorite', materialIconColor: '#d4493e' },
  { title: 'Spicy', emoji: '🌶️' },
  { title: 'Ambiance', materialIcon: 'palette', materialIconColor: '#c27b52' },
  { title: "Ce que j'ai aimé", materialIcon: 'thumb-up', materialIconColor: '#5fa84d' },
  { title: "Ce qui m'a dérangé·e", materialIcon: 'thumb-down', materialIconColor: '#a8a8a8' },
  { title: 'Citations favorites', materialIcon: 'star', materialIconColor: '#d4a017' },
];

// Couleurs alignées sur le thème "paper" de l'app — defaults raisonnables.
export const DEFAULT_APPEARANCE: SheetAppearance = {
  frame: DEFAULT_FRAME,
  fontId: 'dm-sans',
  bgColor: '#f4efe6',
  textColor: '#1a1410',
  mutedColor: '#6b6259',
  accentColor: '#c27b52',
  ratingIcons: DEFAULT_RATING_ICONS,
  defaultCategories: DEFAULT_CATEGORIES,
};

// Style du cadre externe — bg = bgColor de la fiche + bordure. S'applique
// à la carte complète (pas aux sections). Le fond de page reste le thème app.
export function outerCardStyle(a: SheetAppearance, padding = 20) {
  const { frame, bgColor } = a;
  const borderWidth = frame.style === 'none' ? 0 : frame.width;
  return {
    backgroundColor: bgColor,
    borderStyle: frame.style === 'none' ? undefined : (frame.style as 'solid'),
    borderWidth,
    borderColor: frame.color,
    borderRadius: frame.radius,
    padding,
  } as const;
}

// Décale légèrement la couleur vers le blanc pour distinguer la carte du fond global.
export function shiftTowardsPaper(hex: string): string {
  const m = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(m)) return hex;
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const mix = luma > 0.5 ? 0.08 : 0.14;
  const mr = Math.round(r + (255 - r) * mix);
  const mg = Math.round(g + (255 - g) * mix);
  const mb = Math.round(b + (255 - b) * mix);
  const to = (n: number) => n.toString(16).padStart(2, '0');
  return `#${to(mr)}${to(mg)}${to(mb)}`;
}

export function hexWithAlpha(hex: string, alpha: number): string {
  const m = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(m)) return hex;
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${m}${a}`;
}

// True si l'appearance de la fiche diffère du template global courant.
// Usage : badge "perso" sur les listes et la detail screen.
export function isCustomAppearance(
  sheetAppearance: SheetAppearanceOverride | undefined,
  global: SheetAppearance,
): boolean {
  if (!sheetAppearance) return false;
  const effective = mergeAppearance(global, sheetAppearance);
  return JSON.stringify(effective) !== JSON.stringify(global);
}

// Résout l'icône effective d'une section : si son titre matche une catégorie
// du template courant, on utilise l'icône live de cette catégorie (pour que
// les changements d'icône faits dans le customizer se propagent aux sections
// déjà créées). Sinon, fallback sur la copie locale stockée sur la section.
export function resolveSectionIcon(
  section: SheetSection,
  appearance: SheetAppearance,
): {
  emoji?: string;
  materialIcon?: string;
  materialIconColor?: string;
} {
  const norm = (s: string) => s.trim().toLocaleLowerCase('fr');
  const target = norm(section.title);
  const match = appearance.defaultCategories.find(
    (c) => norm(c.title) === target,
  );
  if (match && (match.emoji || match.materialIcon)) {
    return {
      emoji: match.emoji,
      materialIcon: match.materialIcon,
      materialIconColor: match.materialIconColor,
    };
  }
  return {
    emoji: section.emoji,
    materialIcon: section.materialIcon,
    materialIconColor: section.materialIconColor,
  };
}

// Override vide = template. Sinon merge champ-par-champ.
export function mergeAppearance(
  base: SheetAppearance,
  override?: SheetAppearanceOverride,
): SheetAppearance {
  if (!override) return base;
  return {
    frame: override.frame ?? base.frame,
    fontId: override.fontId ?? base.fontId,
    bgColor: override.bgColor ?? base.bgColor,
    textColor: override.textColor ?? base.textColor,
    mutedColor: override.mutedColor ?? base.mutedColor,
    accentColor: override.accentColor ?? base.accentColor,
    ratingIcons: override.ratingIcons ?? base.ratingIcons,
    defaultCategories: override.defaultCategories ?? base.defaultCategories,
  };
}
