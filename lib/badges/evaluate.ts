import type { BadgeKey, BadgeStats } from '@/types/badge';
import { TIERS } from './catalog';

export function computeEarnedKeys(stats: BadgeStats): BadgeKey[] {
  const out: BadgeKey[] = [];

  if (stats.sheetsCount >= 1) out.push('first_sheet');
  if (stats.bingoCompletedCount >= 1) out.push('first_bingo');

  for (const tier of TIERS.sheets) {
    if (stats.sheetsCount >= tier) out.push(`sheets_count:${tier}`);
  }
  for (const tier of TIERS.books) {
    if (stats.booksRead >= tier) out.push(`books_read:${tier}`);
  }
  for (const tier of TIERS.bingo) {
    if (stats.bingoCompletedCount >= tier) out.push(`bingo_completed:${tier}`);
  }
  for (const tier of TIERS.streak) {
    if (stats.streakMax >= tier) out.push(`streak_max:${tier}`);
  }

  return out;
}

export function maxConsecutiveDays(daysIso: string[]): number {
  if (daysIso.length === 0) return 0;
  const set = new Set(daysIso);
  let best = 0;
  for (const d of daysIso) {
    const prev = shiftDay(d, -1);
    if (set.has(prev)) continue;
    let run = 1;
    let cur = d;
    while (set.has(shiftDay(cur, 1))) {
      cur = shiftDay(cur, 1);
      run += 1;
    }
    if (run > best) best = run;
  }
  return best;
}

function shiftDay(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map((n) => Number.parseInt(n, 10));
  const date = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  date.setUTCDate(date.getUTCDate() + delta);
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}
