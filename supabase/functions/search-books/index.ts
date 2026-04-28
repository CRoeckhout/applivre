// Edge function `search-books`
// Recherche multi-registres (ISBN-DB / Google / OpenLibrary / BNF),
// dédup par ISBN. Clés tierces en secret serveur. Pas de cache DB
// (résultats dépendent de la query libre — trop volatil pour cacher par
// clé textuelle).
//
// Ordre des résultats :
//   ISBN-DB (top bucket, ordre API préservé)
//   → bucket auteur si la query ressemble à un patronyme
//   → bucket générique Google+OL (trié popularité)
//   → BNF (queue, ordre source).
// ISBN-DB n'expose pas de score popularité → on garde son ordre brut, ce
// qui préserve la pertinence renvoyée par leur moteur. Sans clé configurée,
// le bucket est vide et la chaîne historique reste intacte.

type SearchResult = {
  isbn: string;
  title: string;
  authors: string[];
  coverUrl?: string;
  year?: number;
  pages?: number;
};

// Champ de tri interne (non exposé au client). Plus haut = plus populaire.
// Source : Google `ratingsCount` ou OpenLibrary `readinglog_count`.
type RankedResult = SearchResult & { _pop?: number };

const GOOGLE_KEY = Deno.env.get('GOOGLE_BOOKS_KEY') ?? '';
const ISBNDB_KEY = Deno.env.get('ISBNDB_KEY') ?? '';

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

  // Une requête mono-token alphabétique (≥3 lettres) ressemble à un patronyme :
  // on lance en parallèle une recherche restreinte au champ "auteur" sur Google
  // et OpenLibrary, puis on préfixe ces résultats au merge final.
  // Ex: "Rowling" → Google `inauthor:Rowling` + OL `author=Rowling` → toute la
  // bibliographie de l'auteur remonte en premier au lieu de dépendre de
  // l'ordre de pertinence des moteurs.
  const authorMode = looksLikeAuthor(q);

  // Chaque source bornée à 6s : Promise.allSettled attend le maillon le plus
  // lent ; sans timeout, un fetcher bloqué consomme tout le wall-time edge et
  // le worker est tué avant de renvoyer. Même bug que resolve-book.
  const tasks = [
    withTimeout(searchIsbnDb(q, limit), 6000, 'isbndb'),
    withTimeout(searchGoogle(q, limit), 6000, 'google'),
    withTimeout(searchOpenLibrary(q, limit), 6000, 'openlibrary'),
    withTimeout(searchBnf(q, limit), 6000, 'bnf'),
  ];
  if (authorMode) {
    tasks.push(withTimeout(searchGoogle(`inauthor:"${q}"`, limit), 6000, 'google-author'));
    tasks.push(withTimeout(searchOpenLibraryByAuthor(q, limit), 6000, 'openlibrary-author'));
  }

  const settled = await Promise.allSettled(tasks);
  const out = settled.map((s) => (s.status === 'fulfilled' ? s.value : []));
  const [isbndb, google, openlib, bnf, googleAuthor = [], openlibAuthor = []] = out;

  // Buckets : ISBN-DB en tête (top priorité), auteur ensuite (intent fort),
  // puis générique, puis BNF. Dans les buckets auteur/générique on trie par
  // popularité décroissante (signal Google / OpenLibrary). ISBN-DB et BNF ne
  // renvoient pas de score → ordre source préservé. Le bucket auteur est
  // filtré strict : on garde uniquement les résultats où le patronyme
  // apparaît dans la liste d'auteurs (Google `inauthor:"X"` matche parfois
  // le prénom dans des titres ou éditeurs — ex. "Hugo" pollué par Mark Twain).
  const isbndbBucket = dedup(isbndb);
  const filteredAuthor = authorMode
    ? [...googleAuthor, ...openlibAuthor].filter((r) =>
        r.authors.some((a) => a.toLowerCase().includes(q.toLowerCase())),
      )
    : [];
  const authorBucket = sortByPopularity(dedup(filteredAuthor));
  const genericBucket = sortByPopularity(dedup([...google, ...openlib]));

  const seen = new Set<string>();
  const merged: SearchResult[] = [];
  for (const r of [...isbndbBucket, ...authorBucket, ...genericBucket, ...bnf]) {
    if (seen.has(r.isbn)) continue;
    seen.add(r.isbn);
    const { _pop, ...clean } = r as RankedResult;
    void _pop;
    merged.push(clean);
  }

  return json({ results: merged.slice(0, limit) });
});

// Borne une promesse : reject après `ms` au lieu de pendre indéfiniment.
// Utilisé pour empêcher un fetcher bloqué de drag toute la fonction au-delà
// du wall-time edge (Promise.allSettled attend le plus lent).
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => {
      console.warn('[search-books] timeout', label, ms, 'ms');
      reject(new Error(`timeout:${label}`));
    }, ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

function dedup(list: RankedResult[]): RankedResult[] {
  const seen = new Set<string>();
  const out: RankedResult[] = [];
  for (const r of list) {
    if (seen.has(r.isbn)) continue;
    seen.add(r.isbn);
    out.push(r);
  }
  return out;
}

function sortByPopularity(list: RankedResult[]): RankedResult[] {
  return [...list].sort((a, b) => (b._pop ?? 0) - (a._pop ?? 0));
}

// Heuristique simple : 3 à 30 lettres, sans espaces, accents/apostrophe/tiret
// autorisés (ex: "Rowling", "Hugo", "Dostoïevski", "O'Brien", "Saint-Exupéry").
// Multi-tokens écartés volontairement — éviter de matcher des titres comme
// "Harry Potter" en mode auteur.
function looksLikeAuthor(q: string): boolean {
  return /^[\p{L}'\-]{3,30}$/u.test(q);
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });
}

// ─── ISBN-DB ───
// API : https://api2.isbndb.com/books/{query}?page=1&pageSize=N
// Auth : header `Authorization: <key>` (sans préfixe Bearer).
// Sans clé configurée → no-op (retourne []) pour ne pas spammer 401.
// ISBN-DB n'expose pas de score popularité → on laisse `_pop` undefined ;
// le merge en bucket dédié préserve l'ordre renvoyé par leur moteur.

type IsbnDbBookHit = {
  title?: string;
  title_long?: string;
  authors?: string[];
  pages?: number;
  date_published?: string;
  image?: string;
  isbn?: string;
  isbn13?: string;
};

async function searchIsbnDb(query: string, limit: number): Promise<RankedResult[]> {
  if (!ISBNDB_KEY) return [];
  const url =
    `https://api2.isbndb.com/books/${encodeURIComponent(query)}` +
    `?page=1&pageSize=${limit}`;
  const res = await fetch(url, { headers: { Authorization: ISBNDB_KEY } });
  if (!res.ok) return [];
  const data = (await res.json()) as { books?: IsbnDbBookHit[] };
  return (data.books ?? [])
    .map((v): RankedResult | null => {
      const isbn = v.isbn13 ?? v.isbn;
      if (!isbn) return null;
      const year = v.date_published?.match(/\d{4}/)?.[0];
      return {
        isbn,
        title: v.title_long ?? v.title ?? 'Titre inconnu',
        authors: v.authors ?? [],
        coverUrl: v.image,
        year: year ? parseInt(year, 10) || undefined : undefined,
        pages: typeof v.pages === 'number' && v.pages > 0 ? v.pages : undefined,
      };
    })
    .filter((r): r is RankedResult => r !== null);
}

// ─── Google Books ───

type GBVolumeInfo = {
  title?: string;
  authors?: string[];
  publishedDate?: string;
  pageCount?: number;
  industryIdentifiers?: { type: string; identifier: string }[];
  imageLinks?: { thumbnail?: string; smallThumbnail?: string };
  ratingsCount?: number;
  averageRating?: number;
};
type GBVolume = { volumeInfo: GBVolumeInfo };

async function searchGoogle(query: string, limit: number): Promise<RankedResult[]> {
  const url = new URL('https://www.googleapis.com/books/v1/volumes');
  url.searchParams.set('q', query);
  url.searchParams.set('maxResults', String(limit));
  url.searchParams.set('printType', 'books');
  // Locale boost — privilégier les éditions françaises (l'app est FR-only).
  url.searchParams.set('langRestrict', 'fr');
  if (GOOGLE_KEY) url.searchParams.set('key', GOOGLE_KEY);
  const res = await fetch(url.toString());
  if (!res.ok) return [];
  const data = (await res.json()) as { items?: GBVolume[] };
  return (data.items ?? [])
    .map((item): RankedResult | null => {
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
        _pop: v.ratingsCount ?? 0,
      };
    })
    .filter((r): r is RankedResult => r !== null);
}

// ─── OpenLibrary ───

async function searchOpenLibrary(query: string, limit: number): Promise<RankedResult[]> {
  const url = new URL('https://openlibrary.org/search.json');
  // `language:fre` injecté dans `q` (et non en param URL séparé) : c'est la
  // seule forme qui propage le filtre aux éditions imbriquées renvoyées via
  // `fields=editions`. Le param `language=fre` filtre les works mais laisse
  // tomber `editions` du payload → impossible de récupérer le titre FR.
  url.searchParams.set('q', `${query} language:fre`);
  url.searchParams.set('limit', String(limit));
  return fetchOpenLibrary(url);
}

// Mode auteur : OL accepte le paramètre `author` qui restreint au champ
// indexé `author_name`. Bien plus précis que `q=Rowling` pour cibler la
// bibliographie d'un patronyme courant.
async function searchOpenLibraryByAuthor(
  author: string,
  limit: number,
): Promise<RankedResult[]> {
  const url = new URL('https://openlibrary.org/search.json');
  url.searchParams.set('author', author);
  url.searchParams.set('q', 'language:fre');
  url.searchParams.set('limit', String(limit));
  return fetchOpenLibrary(url);
}

async function fetchOpenLibrary(url: URL): Promise<RankedResult[]> {
  // Demander explicitement les champs popularité — OL ne les renvoie pas
  // tous par défaut. On demande aussi `editions.*` : quand la query texte
  // matche les titres d'éditions (ex. "Harry Potter language:fre"), OL
  // renvoie inline le titre/ISBN FR. Sinon fallback : seconde requête à
  // `/works/<key>/editions.json` pour piocher l'édition FR.
  url.searchParams.set(
    'fields',
    [
      'key',
      'isbn',
      'title',
      'author_name',
      'first_publish_year',
      'number_of_pages_median',
      'cover_i',
      'readinglog_count',
      'ratings_count',
      'editions',
      'editions.title',
      'editions.isbn',
      'editions.language',
    ].join(','),
  );
  const res = await fetch(url.toString());
  if (!res.ok) return [];
  const data = (await res.json()) as {
    docs?: {
      key?: string;
      isbn?: string[];
      title?: string;
      author_name?: string[];
      first_publish_year?: number;
      number_of_pages_median?: number;
      cover_i?: number;
      readinglog_count?: number;
      ratings_count?: number;
      editions?: {
        docs?: {
          title?: string;
          isbn?: string[];
          language?: string[];
        }[];
      };
    }[];
  };
  const docs = data.docs ?? [];
  return await Promise.all(
    docs.map(async (d): Promise<RankedResult | null> => {
      // 1) Édition FR inline (cas heureux : query texte matche les titres FR).
      let frTitle: string | undefined;
      let frIsbn: string | undefined;
      const inlineFr = d.editions?.docs?.find((e) => e.language?.includes('fre'));
      if (inlineFr) {
        frTitle = inlineFr.title;
        frIsbn = inlineFr.isbn?.[0];
      } else if (d.key) {
        // 2) Fallback : pioche dans les éditions du work.
        const fr = await pickFrenchEdition(d.key);
        frTitle = fr?.title;
        frIsbn = fr?.isbn;
      }

      const title = (frTitle ?? d.title ?? 'Titre inconnu').normalize('NFC');
      const isbn = frIsbn ?? d.isbn?.[0];
      if (!isbn) return null;
      // `readinglog_count` (nb d'utilisateurs ayant le livre dans une étagère)
      // est le signal le plus stable. Fallback sur `ratings_count`.
      const pop = d.readinglog_count ?? d.ratings_count ?? 0;
      return {
        isbn,
        title,
        authors: d.author_name ?? [],
        coverUrl: d.cover_i
          ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg`
          : undefined,
        year: d.first_publish_year,
        pages: d.number_of_pages_median,
        _pop: pop,
      };
    }),
  ).then((results) => results.filter((r): r is RankedResult => r !== null));
}

// Pour un work donné, récupère la première édition de langue française.
// Utilisé quand la query OL ne propage pas le filtre `language:fre` aux
// éditions imbriquées (typiquement en mode auteur, où le surname ne matche
// pas les titres d'édition).
async function pickFrenchEdition(
  workKey: string,
): Promise<{ title?: string; isbn?: string } | null> {
  const url = `https://openlibrary.org${workKey}/editions.json?limit=200`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as {
    entries?: {
      title?: string;
      isbn_13?: string[];
      isbn_10?: string[];
      languages?: { key?: string }[];
    }[];
  };
  const entry = (data.entries ?? []).find((e) =>
    e.languages?.some((l) => l.key === '/languages/fre'),
  );
  if (!entry) return null;
  return {
    title: entry.title,
    isbn: entry.isbn_13?.[0] ?? entry.isbn_10?.[0],
  };
}

// ─── BNF (SRU XML, best effort) ───

async function searchBnf(query: string, limit: number): Promise<RankedResult[]> {
  const q = encodeURIComponent(`bib.anywhere all "${query}"`);
  const url =
    `https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve&` +
    `query=${q}&recordSchema=dublincore&maximumRecords=${limit}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const xml = await res.text();
  const records = xml.split('<srw:record>').slice(1);
  const out: RankedResult[] = [];
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
