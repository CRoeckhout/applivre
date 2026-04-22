import type { Book } from '@/types/book';

const BASE = 'https://openlibrary.org';

export type SearchResult = {
  isbn: string;
  title: string;
  authors: string[];
  coverUrl?: string;
  year?: number;
  pages?: number;
};

type RawSearchDoc = {
  title?: string;
  author_name?: string[];
  cover_i?: number;
  isbn?: string[];
  first_publish_year?: number;
  number_of_pages_median?: number;
};

export async function searchBooks(query: string, limit = 20): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const params = new URLSearchParams({
    q,
    limit: String(limit),
    fields: 'title,author_name,cover_i,isbn,first_publish_year,number_of_pages_median',
  });
  const res = await fetch(`${BASE}/search.json?${params}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { docs?: RawSearchDoc[] };
  return (data.docs ?? [])
    .map((doc): SearchResult | null => {
      const isbn = doc.isbn?.find((v) => v.length === 13) ?? doc.isbn?.[0];
      if (!isbn) return null;
      return {
        isbn,
        title: doc.title ?? 'Titre inconnu',
        authors: doc.author_name ?? [],
        coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : undefined,
        year: doc.first_publish_year,
        pages: doc.number_of_pages_median,
      };
    })
    .filter((r): r is SearchResult => r !== null);
}

type RawBook = {
  title?: string;
  authors?: { name?: string; key?: string }[];
  number_of_pages?: number;
  publish_date?: string;
  covers?: number[];
};

export async function fetchBookByIsbn(isbn: string): Promise<Book | null> {
  const clean = isbn.replace(/[^0-9X]/gi, '');
  const res = await fetch(`${BASE}/isbn/${clean}.json`);
  if (!res.ok) return null;
  const raw = (await res.json()) as RawBook;

  const authorNames = await resolveAuthors(raw.authors);

  return {
    isbn: clean,
    title: raw.title ?? 'Titre inconnu',
    authors: authorNames,
    pages: raw.number_of_pages,
    publishedAt: raw.publish_date,
    // On ne tente pas un fallback URL si OL n'a pas de couverture réelle :
    // l'endpoint /b/isbn/ renvoie un placeholder gris quand l'image n'existe pas.
    coverUrl: raw.covers?.[0]
      ? `https://covers.openlibrary.org/b/id/${raw.covers[0]}-L.jpg`
      : undefined,
  };
}

async function resolveAuthors(authors?: { name?: string; key?: string }[]): Promise<string[]> {
  if (!authors?.length) return [];
  const names = await Promise.all(
    authors.map(async (a) => {
      if (a.name) return a.name;
      if (!a.key) return null;
      try {
        const r = await fetch(`${BASE}${a.key}.json`);
        if (!r.ok) return null;
        const data = (await r.json()) as { name?: string };
        return data.name ?? null;
      } catch {
        return null;
      }
    }),
  );
  return names.filter((n): n is string => !!n);
}
