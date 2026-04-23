import { fetchBookByIsbnBnf, searchBooksBnf } from '@/lib/bnf';
import { fetchBookByIsbnGoogle, searchBooksGoogle } from '@/lib/googlebooks';
import {
  fetchBookByIsbn as fetchBookByIsbnOL,
  searchBooks as searchBooksOL,
  type SearchResult,
} from '@/lib/openlibrary';
import type { Book, BookSource } from '@/types/book';

export type { SearchResult };

/**
 * Récupère un livre par ISBN via 3 registres en parallèle :
 * Google Books (primaire, riche en métadonnées et couvertures),
 * Open Library (complément international),
 * BNF (filet FR, exhaustif pour les livres édités en France).
 * Les champs manquants sont complétés par les sources secondaires.
 */
export async function fetchBook(isbn: string): Promise<Book | null> {
  const clean = isbn.replace(/[^0-9X]/gi, '');
  if (__DEV__) console.log('[fetchBook] start', clean);
  const [g, o, b] = await Promise.allSettled([
    fetchBookByIsbnGoogle(clean),
    fetchBookByIsbnOL(clean),
    fetchBookByIsbnBnf(clean),
  ]);
  const google = g.status === 'fulfilled' ? g.value : null;
  const openlib = o.status === 'fulfilled' ? o.value : null;
  const bnf = b.status === 'fulfilled' ? b.value : null;

  if (__DEV__) {
    console.log('[fetchBook] google:', g.status === 'fulfilled' ? google : g.reason);
    console.log('[fetchBook] openlib:', o.status === 'fulfilled' ? openlib : o.reason);
    console.log('[fetchBook] bnf:', b.status === 'fulfilled' ? bnf : b.reason);
  }

  if (!google && !openlib && !bnf) return null;

  const primary = google ?? openlib ?? bnf!;
  const source: BookSource = google ? 'googlebooks' : openlib ? 'openlibrary' : 'bnf';
  const candidates = [google, openlib, bnf].filter((x): x is Book => !!x);

  const pick = <K extends keyof Book>(key: K): Book[K] | undefined => {
    for (const c of candidates) {
      const v = c[key];
      if (v !== undefined && v !== null && (!Array.isArray(v) || v.length > 0) && v !== '') {
        return v;
      }
    }
    return undefined;
  };

  const merged: Book = {
    isbn: primary.isbn || clean,
    title: pick('title') ?? 'Titre inconnu',
    authors: (pick('authors') as string[] | undefined) ?? [],
    pages: pick('pages') as number | undefined,
    publishedAt: pick('publishedAt') as string | undefined,
    coverUrl: pick('coverUrl') as string | undefined,
    source,
    categories: pick('categories') as string[] | undefined,
  };
  if (__DEV__) console.log('[fetchBook] merged:', merged);
  return merged;
}

/**
 * Recherche multi-registres. Google d'abord (meilleure pertinence + couvertures),
 * Open Library pour compléter, BNF pour les livres FR introuvables ailleurs.
 * Dédup par ISBN.
 */
export async function search(query: string, limit = 20): Promise<SearchResult[]> {
  const [g, o, b] = await Promise.allSettled([
    searchBooksGoogle(query, limit),
    searchBooksOL(query, limit),
    searchBooksBnf(query, limit),
  ]);
  const google = g.status === 'fulfilled' ? g.value : [];
  const openlib = o.status === 'fulfilled' ? o.value : [];
  const bnf = b.status === 'fulfilled' ? b.value : [];

  const seen = new Set<string>();
  const merged: SearchResult[] = [];

  for (const r of [...google, ...openlib, ...bnf]) {
    if (!seen.has(r.isbn)) {
      seen.add(r.isbn);
      merged.push(r);
    }
  }

  return merged.slice(0, limit);
}
