import { toIso } from '@/lib/date';
import type { ReadingSession } from '@/types/book';

// Le jour d'une session = date locale (pas UTC), pour qu'une session
// démarrée tard le soir compte sur le bon jour côté utilisateur.
export function dayOfSession(s: ReadingSession): string {
  return toIso(new Date(s.startedAt));
}

// Vrai si la somme des durées des sessions du jour `day` atteint le seuil.
// Sert à décider si la table reading_streak_days doit avoir une row pour
// ce jour, même sans validation manuelle.
export function isDayAutoValidated(
  sessions: ReadingSession[],
  day: string,
  goalMinutes: number,
): boolean {
  const goalSec = goalMinutes * 60;
  let total = 0;
  for (const s of sessions) {
    if (dayOfSession(s) === day) {
      total += s.durationSec;
      if (total >= goalSec) return true;
    }
  }
  return false;
}
