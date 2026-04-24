// Edge function `resolve-book`
// Reçoit { isbn } → résout via Google / OpenLibrary / BNF côté serveur,
// merge les résultats, cache/upsert dans public.books, renvoie le Book canonique.
//
// Bénéfices vs appels client directs :
// - Clé Google Books en env serveur (plus exposée dans le bundle)
// - Cache DB : re-demande même ISBN = pas de re-fetch tant que `books` à jour
// - Point de contrôle centralisé pour data quality (normalisation, bannissement, etc.)
//
// Déploiement : `supabase functions deploy resolve-book`
// Secret : `supabase secrets set GOOGLE_BOOKS_KEY=xxx`

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

type Book = {
  isbn: string;
  title: string;
  authors: string[];
  pages?: number;
  publishedAt?: string;
  coverUrl?: string;
  source?: 'openlibrary' | 'googlebooks' | 'bnf' | 'manual';
  categories?: string[];
};

const GOOGLE_KEY = Deno.env.get('GOOGLE_BOOKS_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  let body: { isbn?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const isbn = normalizeIsbn(body.isbn);
  if (!isbn) return json({ error: 'missing_isbn' }, 400);

  const db = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Cache hit ? Si `books` déjà présent, on renvoie tel quel.
  // TTL à implémenter plus tard (cached_at vs now).
  const { data: cached } = await db
    .from('books')
    .select('*')
    .eq('isbn', isbn)
    .maybeSingle();

  if (cached) {
    return json({ book: toBook(cached), source: 'cache' });
  }

  // Fetch parallèle. Promise.allSettled pour tolérer les pannes individuelles.
  const [g, o, b] = await Promise.allSettled([
    fetchGoogle(isbn),
    fetchOpenLibrary(isbn),
    fetchBnf(isbn),
  ]);
  const google = g.status === 'fulfilled' ? g.value : null;
  const openlib = o.status === 'fulfilled' ? o.value : null;
  const bnf = b.status === 'fulfilled' ? b.value : null;

  if (!google && !openlib && !bnf) {
    return json({ error: 'not_found', isbn }, 404);
  }

  const merged = mergeBooks(isbn, { google, openlib, bnf });

  // Upsert en cache.
  const { error: upsertErr } = await db
    .from('books')
    .upsert({
      isbn: merged.isbn,
      title: merged.title,
      authors: merged.authors,
      pages: merged.pages ?? null,
      published_at: merged.publishedAt ?? null,
      cover_url: merged.coverUrl ?? null,
      source: merged.source ?? null,
      categories: merged.categories ?? [],
    }, { onConflict: 'isbn' });
  if (upsertErr) console.error('[resolve-book] upsert error', upsertErr);

  return json({ book: merged, source: 'fresh' });
});

// ═════════════ Helpers ═════════════

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });
}

function normalizeIsbn(raw: string | undefined): string | null {
  if (!raw) return null;
  const clean = raw.replace(/[^0-9X]/gi, '');
  if (clean.length < 10) return null;
  return clean;
}

function toBook(row: Record<string, unknown>): Book {
  return {
    isbn: row.isbn as string,
    title: row.title as string,
    authors: (row.authors as string[]) ?? [],
    pages: (row.pages as number) ?? undefined,
    publishedAt: (row.published_at as string) ?? undefined,
    coverUrl: (row.cover_url as string) ?? undefined,
    source: (row.source as Book['source']) ?? undefined,
    categories:
      Array.isArray(row.categories) && (row.categories as unknown[]).length > 0
        ? (row.categories as string[])
        : undefined,
  };
}

function mergeBooks(
  isbn: string,
  sources: { google: Book | null; openlib: Book | null; bnf: Book | null },
): Book {
  const { google, openlib, bnf } = sources;
  const primary = google ?? openlib ?? bnf!;
  const source: Book['source'] = google ? 'googlebooks' : openlib ? 'openlibrary' : 'bnf';
  const candidates = [google, openlib, bnf].filter((x): x is Book => !!x);

  const pick = <K extends keyof Book>(key: K): Book[K] | undefined => {
    for (const c of candidates) {
      const v = c[key];
      if (
        v !== undefined &&
        v !== null &&
        (!Array.isArray(v) || v.length > 0) &&
        v !== ''
      ) {
        return v;
      }
    }
    return undefined;
  };

  return {
    isbn: primary.isbn || isbn,
    title: pick('title') ?? 'Titre inconnu',
    authors: (pick('authors') as string[] | undefined) ?? [],
    pages: pick('pages') as number | undefined,
    publishedAt: pick('publishedAt') as string | undefined,
    coverUrl: pick('coverUrl') as string | undefined,
    source,
    categories: pick('categories') as string[] | undefined,
  };
}

// ─── Google Books ───

type GBVolumeInfo = {
  title?: string;
  authors?: string[];
  publishedDate?: string;
  pageCount?: number;
  industryIdentifiers?: { type: string; identifier: string }[];
  imageLinks?: { thumbnail?: string; smallThumbnail?: string };
  categories?: string[];
};
type GBVolume = { volumeInfo: GBVolumeInfo };

async function fetchGoogle(isbn: string): Promise<Book | null> {
  const url = new URL('https://www.googleapis.com/books/v1/volumes');
  url.searchParams.set('q', `isbn:${isbn}`);
  url.searchParams.set('maxResults', '1');
  if (GOOGLE_KEY) url.searchParams.set('key', GOOGLE_KEY);
  const res = await fetch(url.toString());
  if (!res.ok) return null;
  const data = (await res.json()) as { items?: GBVolume[] };
  const item = data.items?.[0];
  if (!item) return null;
  const v = item.volumeInfo;
  const ids = v.industryIdentifiers ?? [];
  const extracted =
    ids.find((x) => x.type === 'ISBN_13')?.identifier ??
    ids.find((x) => x.type === 'ISBN_10')?.identifier;
  const cover = (v.imageLinks?.thumbnail ?? v.imageLinks?.smallThumbnail)
    ?.replace('http://', 'https://')
    .replace('&edge=curl', '');
  return {
    isbn: extracted ?? isbn,
    title: v.title ?? 'Titre inconnu',
    authors: v.authors ?? [],
    pages: v.pageCount,
    publishedAt: v.publishedDate,
    coverUrl: cover,
    categories: v.categories && v.categories.length > 0 ? v.categories : undefined,
  };
}

// ─── OpenLibrary ───

async function fetchOpenLibrary(isbn: string): Promise<Book | null> {
  const res = await fetch(
    `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`,
  );
  if (!res.ok) return null;
  const data = (await res.json()) as Record<string, {
    title?: string;
    authors?: { name: string }[];
    number_of_pages?: number;
    publish_date?: string;
    cover?: { large?: string; medium?: string; small?: string };
    subjects?: { name: string }[];
  }>;
  const key = `ISBN:${isbn}`;
  const row = data[key];
  if (!row) return null;
  return {
    isbn,
    title: row.title ?? 'Titre inconnu',
    authors: (row.authors ?? []).map((a) => a.name),
    pages: row.number_of_pages,
    publishedAt: row.publish_date,
    coverUrl: row.cover?.large ?? row.cover?.medium ?? row.cover?.small,
    categories: row.subjects && row.subjects.length > 0
      ? row.subjects.slice(0, 10).map((s) => s.name)
      : undefined,
  };
}

// ─── BNF (SRU XML) ───

async function fetchBnf(isbn: string): Promise<Book | null> {
  const query = encodeURIComponent(`bib.isbn all "${isbn}"`);
  const url =
    `https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve&` +
    `query=${query}&recordSchema=dublincore&maximumRecords=1`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const xml = await res.text();
  const get = (tag: string): string | undefined => {
    const m = xml.match(
      new RegExp(`<dc:${tag}[^>]*>([\\s\\S]*?)</dc:${tag}>`, 'i'),
    );
    return m?.[1]?.trim();
  };
  const title = get('title');
  if (!title) return null;
  const creator = get('creator');
  const date = get('date');
  const year = date ? date.match(/\d{4}/)?.[0] : undefined;
  return {
    isbn,
    title: title.replace(/\s+/g, ' '),
    authors: creator ? [creator.split('.')[0].trim()] : [],
    publishedAt: year,
  };
}
