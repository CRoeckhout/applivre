import type { SearchResult } from '@/lib/openlibrary';
import type { Book } from '@/types/book';

const BASE = 'https://www.googleapis.com/books/v1';

// Clé API Books (EXPO_PUBLIC_* → injectée côté client par Expo).
// Sans clé → fallback sur le pool anonyme partagé (quota global très volatil).
// Avec clé → projet Google Cloud dédié, 1k req/jour gratuites, quota prévisible.
const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_BOOKS_KEY;

function withKey(url: string): string {
  if (!API_KEY) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}key=${encodeURIComponent(API_KEY)}`;
}

type IndustryId = { type: string; identifier: string };

type GBVolumeInfo = {
  title?: string;
  authors?: string[];
  publishedDate?: string;
  pageCount?: number;
  industryIdentifiers?: IndustryId[];
  imageLinks?: { thumbnail?: string; smallThumbnail?: string };
  language?: string;
  categories?: string[];
};

type GBVolume = { id: string; volumeInfo: GBVolumeInfo };

function cleanCover(url?: string): string | undefined {
  if (!url) return undefined;
  return url.replace('http://', 'https://').replace('&edge=curl', '');
}

function extractIsbn(ids?: IndustryId[]): string | undefined {
  if (!ids) return undefined;
  const i13 = ids.find((x) => x.type === 'ISBN_13');
  if (i13) return i13.identifier;
  const i10 = ids.find((x) => x.type === 'ISBN_10');
  return i10?.identifier;
}

export async function fetchBookByIsbnGoogle(isbn: string): Promise<Book | null> {
  const clean = isbn.replace(/[^0-9X]/gi, '');
  const res = await fetch(withKey(`${BASE}/volumes?q=isbn:${clean}&maxResults=1`));
  if (!res.ok) {
    if (__DEV__) console.warn('[googlebooks] fetchByIsbn HTTP', res.status, isbn);
    return null;
  }
  const data = (await res.json()) as { items?: GBVolume[] };
  const item = data.items?.[0];
  if (!item) return null;
  const v = item.volumeInfo;
  return {
    isbn: extractIsbn(v.industryIdentifiers) ?? clean,
    title: v.title ?? 'Titre inconnu',
    authors: v.authors ?? [],
    pages: v.pageCount,
    publishedAt: v.publishedDate,
    coverUrl: cleanCover(v.imageLinks?.thumbnail ?? v.imageLinks?.smallThumbnail),
    categories: v.categories && v.categories.length > 0 ? v.categories : undefined,
  };
}

export async function searchBooksGoogle(query: string, limit = 20): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const params = new URLSearchParams({
    q,
    maxResults: String(Math.min(limit, 40)),
    printType: 'books',
  });
  const res = await fetch(withKey(`${BASE}/volumes?${params}`));
  if (!res.ok) {
    if (__DEV__) console.warn('[googlebooks] search HTTP', res.status, q);
    return [];
  }
  const data = (await res.json()) as { items?: GBVolume[] };
  return (data.items ?? [])
    .map((item): SearchResult | null => {
      const v = item.volumeInfo;
      const isbn = extractIsbn(v.industryIdentifiers);
      if (!isbn) return null;
      return {
        isbn,
        title: v.title ?? 'Titre inconnu',
        authors: v.authors ?? [],
        coverUrl: cleanCover(v.imageLinks?.thumbnail ?? v.imageLinks?.smallThumbnail),
        year: v.publishedDate ? parseInt(v.publishedDate.slice(0, 4), 10) || undefined : undefined,
        pages: v.pageCount,
      };
    })
    .filter((r): r is SearchResult => r !== null);
}
