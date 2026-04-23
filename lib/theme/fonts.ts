// Définition des polices disponibles. Chaque police fournit 5 familles
// (sans/sans-med/sans-semi/sans-bold/display). Les polices sans variante
// de graisse dupliquent la même famille pour chaque rôle.

export type FontId =
  | 'dm-sans'
  | 'lora'
  | 'caveat'
  | 'unifraktur'
  | 'orbitron'
  | 'space-mono';

export type FontVariants = {
  sans: string;
  sansMed: string;
  sansSemi: string;
  sansBold: string;
  display: string;
};

export type FontDef = {
  id: FontId;
  label: string;
  hint: string;
  sample: string;
  variants: FontVariants;
};

export const FONTS: FontDef[] = [
  {
    id: 'dm-sans',
    label: 'Moderne',
    hint: 'DM Sans — neutre et lisible',
    sample: 'Aa Bb 123',
    variants: {
      sans: 'DMSans_400Regular',
      sansMed: 'DMSans_500Medium',
      sansSemi: 'DMSans_600SemiBold',
      sansBold: 'DMSans_700Bold',
      display: 'DMSans_600SemiBold',
    },
  },
  {
    id: 'lora',
    label: 'Classique',
    hint: 'Lora — serif de lecture',
    sample: 'Aa Bb 123',
    variants: {
      sans: 'Lora_400Regular',
      sansMed: 'Lora_500Medium',
      sansSemi: 'Lora_600SemiBold',
      sansBold: 'Lora_700Bold',
      display: 'Lora_600SemiBold',
    },
  },
  {
    id: 'caveat',
    label: 'Manuscrit',
    hint: 'Caveat — carnet à main',
    sample: 'Aa Bb 123',
    variants: {
      sans: 'Caveat_400Regular',
      sansMed: 'Caveat_500Medium',
      sansSemi: 'Caveat_600SemiBold',
      sansBold: 'Caveat_700Bold',
      display: 'Caveat_700Bold',
    },
  },
  {
    id: 'unifraktur',
    label: 'Gothique',
    hint: 'UnifrakturMaguntia',
    sample: 'Aa Bb 123',
    variants: {
      sans: 'UnifrakturMaguntia_400Regular',
      sansMed: 'UnifrakturMaguntia_400Regular',
      sansSemi: 'UnifrakturMaguntia_400Regular',
      sansBold: 'UnifrakturMaguntia_400Regular',
      display: 'UnifrakturMaguntia_400Regular',
    },
  },
  {
    id: 'orbitron',
    label: 'Neon',
    hint: 'Orbitron — futuriste',
    sample: 'Aa Bb 123',
    variants: {
      sans: 'Orbitron_400Regular',
      sansMed: 'Orbitron_500Medium',
      sansSemi: 'Orbitron_600SemiBold',
      sansBold: 'Orbitron_700Bold',
      display: 'Orbitron_700Bold',
    },
  },
  {
    id: 'space-mono',
    label: 'Terminal',
    hint: 'Space Mono — monospace',
    sample: 'Aa Bb 123',
    variants: {
      sans: 'SpaceMono_400Regular',
      sansMed: 'SpaceMono_400Regular',
      sansSemi: 'SpaceMono_700Bold',
      sansBold: 'SpaceMono_700Bold',
      display: 'SpaceMono_700Bold',
    },
  },
];

export const DEFAULT_FONT_ID: FontId = 'dm-sans';

export function getFont(id: FontId): FontDef {
  return FONTS.find((f) => f.id === id) ?? FONTS[0];
}
