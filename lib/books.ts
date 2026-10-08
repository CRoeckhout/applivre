import { supabase } from '@/lib/supabase';
import type { Book } from '@/types/book';

export type SearchResult = {
  isbn: string;
  title: string;
  authors: string[];
  coverUrl?: string;
  year?: number;
  pages?: number;
};

export type ResolveBookResult =
  | { status: 'found'; book: Book }
  | { status: 'not_found' }
  | { status: 'error' };

/**
 * Résolution ISBN via edge function `resolve-book`.
 * Google Books / OpenLibrary / BNF sont interrogés côté serveur, la clé
 * Google reste en secret serveur, et le résultat est caché dans la
 * table `books`. Le client reçoit directement le Book canonique.
 *
 * Distingue « introuvable partout » (404 `not_found`) d'une erreur réseau /
 * serveur, pour que le scanner ne propose la soumission que dans le 1er cas.
 */
export async function resolveBook(isbn: string): Promise<ResolveBookResult> {
  const clean = isbn.replace(/[^0-9X]/gi, '');
  if (__DEV__) console.log('[fetchBook] invoke resolve-book', clean);
  const { data, error } = await supabase.functions.invoke<{
    book?: Book;
    error?: string;
    source?: 'cache' | 'fresh';
  }>('resolve-book', {
    body: { isbn: clean },
  });
  if (error) {
    if (__DEV__) console.warn('[fetchBook] edge error', error);
    const status = (error as { context?: Response }).context?.status;
    return status === 404 ? { status: 'not_found' } : { status: 'error' };
  }
  if (!data?.book) return { status: 'not_found' };
  if (__DEV__) console.log('[fetchBook] result', data.source, data.book);
  return { status: 'found', book: data.book };
}

export async function fetchBook(isbn: string): Promise<Book | null> {
  const result = await resolveBook(isbn);
  return result.status === 'found' ? result.book : null;
}

/**
 * Recherche multi-registres via edge function `search-books`.
 * Google / OpenLibrary / BNF interrogés côté serveur, dédup par ISBN.
 * Google key reste en secret serveur.
 */
export async function search(query: string, limit = 20): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const { data, error } = await supabase.functions.invoke<{
    results?: SearchResult[];
    error?: string;
  }>('search-books', {
    body: { query: q, limit },
  });
  if (error) {
    if (__DEV__) console.warn('[search] edge error', error);
    return [];
  }
  return data?.results ?? [];
}
