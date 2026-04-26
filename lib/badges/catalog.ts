import type { BadgeDef, BadgeKey } from '@/types/badge';

const COLORS = {
  ink: '#2b2118',
  amber: '#c27b52',
  emerald: '#3f8a6a',
  azure: '#3a6ea5',
  violet: '#7757a3',
  ruby: '#b04848',
  gold: '#c9a13a',
} as const;

const TIERS_SHEETS = [1, 5, 10, 15, 20];
const TIERS_BOOKS = [10, 25, 50, 100, 250];
const TIERS_BINGO = [5, 10];
const TIERS_STREAK = [7, 30, 100, 365];

const SHEETS_COLORS = [COLORS.amber, COLORS.amber, COLORS.amber, COLORS.gold, COLORS.gold];
const BOOKS_COLORS = [COLORS.emerald, COLORS.emerald, COLORS.azure, COLORS.violet, COLORS.gold];
const BINGO_COLORS = [COLORS.ruby, COLORS.gold];
const STREAK_COLORS = [COLORS.amber, COLORS.emerald, COLORS.violet, COLORS.gold];

function colorForTier(tiers: number[], scale: string[], tier: number): string {
  const idx = tiers.indexOf(tier);
  return scale[idx] ?? scale[scale.length - 1] ?? COLORS.ink;
}

function makeTierKey(family: string, tier: number): BadgeKey {
  return `${family}:${tier}`;
}

const defs: BadgeDef[] = [];

defs.push({
  key: 'first_sheet',
  family: 'first_sheet',
  primaryColor: COLORS.amber,
  showCount: false,
  title: 'Première fiche',
  description: 'Tu as rédigé ta toute première fiche de lecture.',
});

defs.push({
  key: 'first_bingo',
  family: 'first_bingo',
  primaryColor: COLORS.ruby,
  showCount: false,
  title: 'Premier bingo',
  description: 'Tu as complété ta première ligne (5 livres alignés) sur un bingo.',
});

for (const tier of TIERS_SHEETS) {
  defs.push({
    key: makeTierKey('sheets_count', tier),
    family: 'sheets_count',
    tier,
    primaryColor: colorForTier(TIERS_SHEETS, SHEETS_COLORS, tier),
    showCount: true,
    title: `${tier} fiche${tier > 1 ? 's' : ''} de lecture`,
    description: `Tu possèdes ${tier} fiche${tier > 1 ? 's' : ''} de lecture.`,
  });
}

for (const tier of TIERS_BOOKS) {
  defs.push({
    key: makeTierKey('books_read', tier),
    family: 'books_read',
    tier,
    primaryColor: colorForTier(TIERS_BOOKS, BOOKS_COLORS, tier),
    showCount: true,
    title: `${tier} livres lus`,
    description: `Tu as lu ${tier} livres.`,
  });
}

for (const tier of TIERS_BINGO) {
  defs.push({
    key: makeTierKey('bingo_completed', tier),
    family: 'bingo_completed',
    tier,
    primaryColor: colorForTier(TIERS_BINGO, BINGO_COLORS, tier),
    showCount: true,
    title: `${tier} bingos complétés`,
    description: `Tu as complété ${tier} cartes de bingo.`,
  });
}

for (const tier of TIERS_STREAK) {
  defs.push({
    key: makeTierKey('streak_max', tier),
    family: 'streak_max',
    tier,
    primaryColor: colorForTier(TIERS_STREAK, STREAK_COLORS, tier),
    showCount: true,
    title: `Série de ${tier} jours`,
    description: `Ta plus longue série de lecture atteint ${tier} jours consécutifs.`,
  });
}

export const BADGES: Record<BadgeKey, BadgeDef> = Object.fromEntries(
  defs.map((d) => [d.key, d]),
);

export const TIERS = {
  sheets: TIERS_SHEETS,
  books: TIERS_BOOKS,
  bingo: TIERS_BINGO,
  streak: TIERS_STREAK,
};
