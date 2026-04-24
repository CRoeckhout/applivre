// Edge function `search-books`
// Recherche multi-registres (Google / OpenLibrary / BNF), dédup par ISBN.
// Google key en secret serveur. Pas de cache DB (résultats dépendent de
// la query libre — trop volatil pour cacher par clé textuelle).

type SearchResult = {
  isbn: string;
  title: string;
  authors: string[];
  coverUrl?: string;
  year?: number;
  pages?: number;
};

const GOOGLE_KEY = Deno.env.get('GOOGLE_BOOKS_KEY') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let body: { query?: string; limit?: number };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const q = (body.query ?? '').trim();
  if (q.length < 2) return json({ results: [] });
  const limit = Math.min(Math.max(body.limit ?? 20, 1), 40);

  const [g, o, b] = await Promise.allSettled([
    searchGoogle(q, limit),
    searchOpenLibrary(q, limit),
    searchBnf(q, limit),
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

  return json({ results: merged.slice(0, limit) });
});

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });
}

// ─── Google Books ───

type GBVolumeInfo = {
  title?: string;
  authors?: string[];
  publishedDate?: string;
  pageCount?: number;
  industryIdentifiers?: { type: string; identifier: string }[];
  imageLinks?: { thumbnail?: string; smallThumbnail?: string };
};
type GBVolume = { volumeInfo: GBVolumeInfo };

async function searchGoogle(query: string, limit: number): Promise<SearchResult[]> {
  const url = new URL('https://www.googleapis.com/books/v1/volumes');
  url.searchParams.set('q', query);
  url.searchParams.set('maxResults', String(limit));
  url.searchParams.set('printType', 'books');
  if (GOOGLE_KEY) url.searchParams.set('key', GOOGLE_KEY);
  const res = await fetch(url.toString());
  if (!res.ok) return [];
  const data = (await res.json()) as { items?: GBVolume[] };
  return (data.items ?? [])
    .map((item): SearchResult | null => {
      const v = item.volumeInfo;
      const ids = v.industryIdentifiers ?? [];
      const isbn =
        ids.find((x) => x.type === 'ISBN_13')?.identifier ??
        ids.find((x) => x.type === 'ISBN_10')?.identifier;
      if (!isbn) return null;
      const cover = (v.imageLinks?.thumbnail ?? v.imageLinks?.smallThumbnail)
        ?.replace('http://', 'https://')
        .replace('&edge=curl', '');
      return {
        isbn,
        title: v.title ?? 'Titre inconnu',
        authors: v.authors ?? [],
        coverUrl: cover,
        year: v.publishedDate
          ? parseInt(v.publishedDate.slice(0, 4), 10) || undefined
          : undefined,
        pages: v.pageCount,
      };
    })
    .filter((r): r is SearchResult => r !== null);
}

// ─── OpenLibrary ───

async function searchOpenLibrary(query: string, limit: number): Promise<SearchResult[]> {
  const url = new URL('https://openlibrary.org/search.json');
  url.searchParams.set('q', query);
  url.searchParams.set('limit', String(limit));
  const res = await fetch(url.toString());
  if (!res.ok) return [];
  const data = (await res.json()) as {
    docs?: {
      isbn?: string[];
      title?: string;
      author_name?: string[];
      first_publish_year?: number;
      number_of_pages_median?: number;
      cover_i?: number;
    }[];
  };
  return (data.docs ?? [])
    .map((d): SearchResult | null => {
      const isbn = d.isbn?.[0];
      if (!isbn) return null;
      return {
        isbn,
        title: d.title ?? 'Titre inconnu',
        authors: d.author_name ?? [],
        coverUrl: d.cover_i
          ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg`
          : undefined,
        year: d.first_publish_year,
        pages: d.number_of_pages_median,
      };
    })
    .filter((r): r is SearchResult => r !== null);
}

// ─── BNF (SRU XML, best effort) ───

async function searchBnf(query: string, limit: number): Promise<SearchResult[]> {
  const q = encodeURIComponent(`bib.anywhere all "${query}"`);
  const url =
    `https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve&` +
    `query=${q}&recordSchema=dublincore&maximumRecords=${limit}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const xml = await res.text();
  const records = xml.split('<srw:record>').slice(1);
  const out: SearchResult[] = [];
  for (const rec of records) {
    const get = (tag: string): string | undefined => {
      const m = rec.match(new RegExp(`<dc:${tag}[^>]*>([\\s\\S]*?)</dc:${tag}>`, 'i'));
      return m?.[1]?.trim();
    };
    const ident = get('identifier');
    const isbnMatch = ident?.match(/(\d{9,13}X?)/i);
    if (!isbnMatch) continue;
    const title = get('title');
    if (!title) continue;
    const creator = get('creator');
    const date = get('date');
    const year = date ? parseInt(date.match(/\d{4}/)?.[0] ?? '', 10) || undefined : undefined;
    out.push({
      isbn: isbnMatch[1],
      title: title.replace(/\s+/g, ' '),
      authors: creator ? [creator.split('.')[0].trim()] : [],
      year,
    });
  }
  return out;
}
