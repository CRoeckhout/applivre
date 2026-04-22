import type { SearchResult } from '@/lib/openlibrary';
import type { Book } from '@/types/book';

const BASE = 'https://www.googleapis.com/books/v1';

type IndustryId = { type: string; identifier: string };

type GBVolumeInfo = {
  title?: string;
  authors?: string[];
  publishedDate?: string;
  pageCount?: number;
  industryIdentifiers?: IndustryId[];
  imageLinks?: { thumbnail?: string; smallThumbnail?: string };
  language?: string;
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
  const res = await fetch(`${BASE}/volumes?q=isbn:${clean}&maxResults=1`);
  if (!res.ok) return null;
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
  const res = await fetch(`${BASE}/volumes?${params}`);
  if (!res.ok) return [];
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
