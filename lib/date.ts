// Helpers de dates locales, tous en ISO court YYYY-MM-DD.
// On reste en heure locale de l'utilisateur pour éviter qu'un "jour" bascule
// au mauvais moment selon le fuseau.

export function todayIso(): string {
  return toIso(new Date());
}

export function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function dayOffset(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  return toIso(date);
}

export function isConsecutive(earlier: string, later: string): boolean {
  return dayOffset(earlier, 1) === later;
}

// Dernier·s N jour·s ISO, du plus ancien au plus récent.
export function lastNDays(n: number, today = todayIso()): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(dayOffset(today, -i));
  return out;
}

const FR_SHORT_DOW = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

export function frShortWeekday(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return FR_SHORT_DOW[new Date(y, m - 1, d).getDay()];
}
