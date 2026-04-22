// Delay avant la prochaine tentative, basé sur le nombre de tentatives déjà
// effectuées. Formule : 2s · 2^attempts, plafonné à 30s.
// - attempts=0 (1er échec) → 2s avant retry #2
// - attempts=1 → 4s
// - attempts=2 → 8s
// - attempts=3 → 16s
// - attempts=4 → 30s (plafonné, mais drop arrive avant à MAX_ATTEMPTS=5)

const BASE_DELAY_MS = 2000;
const MAX_DELAY_MS = 30_000;

export function nextRetryDelayMs(attempts: number): number {
  const raw = BASE_DELAY_MS * Math.pow(2, Math.max(0, attempts));
  return Math.min(MAX_DELAY_MS, raw);
}
