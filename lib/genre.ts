import type { UserBook } from '@/types/book';

// Le premier segment ("Fiction / Fantasy" → "Fiction") suffit dans 95% des cas
// pour regrouper au niveau macro. On trim et on garde la casse d'origine.
export function normalizeCategory(raw: string): string {
  const first = raw.split('/')[0]?.trim() ?? raw.trim();
  return first.length > 0 ? first : raw.trim();
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const t = v.trim();
    if (t.length === 0) continue;
    const key = t.toLocaleLowerCase('fr');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

// Genres affichés pour un livre : override user si non vide,
// sinon catégories API normalisées. Toujours déduplique.
export function displayGenres(ub: UserBook): string[] {
  if (ub.genres && ub.genres.length > 0) return dedupe(ub.genres);
  const raw = ub.book.categories ?? [];
  return dedupe(raw.map(normalizeCategory));
}

// Genre "principal" pour tuiles/filtres mono-valeur. Null si aucun.
export function primaryGenre(ub: UserBook): string | null {
  return displayGenres(ub)[0] ?? null;
}

// Suggestions pour l'éditeur : catégories API normalisées, déduplicées.
export function categorySuggestions(ub: UserBook): string[] {
  const raw = ub.book.categories ?? [];
  return dedupe(raw.map(normalizeCategory));
}
