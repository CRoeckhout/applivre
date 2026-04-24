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

/**
 * Résolution ISBN via edge function `resolve-book`.
 * Google Books / OpenLibrary / BNF sont interrogés côté serveur, la clé
 * Google reste en secret serveur, et le résultat est caché dans la
 * table `books`. Le client reçoit directement le Book canonique.
 */
export async function fetchBook(isbn: string): Promise<Book | null> {
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
    return null;
  }
  if (!data?.book) return null;
  if (__DEV__) console.log('[fetchBook] result', data.source, data.book);
  return data.book;
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
