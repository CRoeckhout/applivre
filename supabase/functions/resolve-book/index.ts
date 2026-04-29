// Edge function `resolve-book`
// Reçoit { isbn } → résout via ISBN-DB / Google / OpenLibrary / BNF côté serveur,
// merge les résultats, cache/upsert dans public.books, renvoie le Book canonique.
//
// Priorité de merge (premier renseigné gagne par champ) :
//   ISBN-DB → Google Books → OpenLibrary → BNF.
// ISBN-DB est top priorité quand sa clé est configurée ; sans clé, sa requête
// échoue silencieusement et le merge retombe sur les autres sources.
//
// Bénéfices vs appels client directs :
// - Clés tierces en env serveur (jamais exposées dans le bundle)
// - Cache DB : re-demande même ISBN = pas de re-fetch tant que `books` à jour
// - Point de contrôle centralisé pour data quality (normalisation, bannissement, etc.)
//
// Déploiement : `supabase functions deploy resolve-book`
// Secrets : `supabase secrets set GOOGLE_BOOKS_KEY=xxx ISBNDB_KEY=yyy GROQ_API_KEY=zzz`

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { cleanWithGroq } from '../_shared/groq-cleanup.ts';
import { isIsbnDbPlaceholder } from '../_shared/isbndb-placeholder.ts';

type Book = {
  isbn: string;
  title: string;
  authors: string[];
  pages?: number;
  publishedAt?: string;
  coverUrl?: string;
  source?: 'isbndb' | 'openlibrary' | 'googlebooks' | 'bnf' | 'manual';
  categories?: string[];
};

const GOOGLE_KEY = Deno.env.get('GOOGLE_BOOKS_KEY') ?? '';
const ISBNDB_KEY = Deno.env.get('ISBNDB_KEY') ?? '';
const GROQ_KEY = Deno.env.get('GROQ_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// Seuil minimal de confiance pour appliquer le cleanup Groq automatique. En
// dessous on log et on conserve le merge brut — évite de remplacer du contenu
// correct par une hallucination basse confiance.
const GROQ_MIN_CONFIDENCE = 0.6;
// Timeout du nettoyage IA. Si Groq pend on retombe sur le merge brut sans
// faire échouer la résolution.
const GROQ_TIMEOUT_MS = 4000;

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

  // Fetch parallèle avec timeout par source pour empêcher un fetcher lent
  // (BNF SRU / OpenLibrary / Google) de bloquer la fonction au-delà de la
  // limite wall-time edge.
  const [i, g, o, b] = await Promise.allSettled([
    withTimeout(fetchIsbnDb(isbn), 6000, 'isbndb'),
    withTimeout(fetchGoogle(isbn), 6000, 'google'),
    withTimeout(fetchOpenLibrary(isbn), 6000, 'openlibrary'),
    withTimeout(fetchBnf(isbn), 6000, 'bnf'),
  ]);
  const isbndb = i.status === 'fulfilled' ? i.value : null;
  const google = g.status === 'fulfilled' ? g.value : null;
  const openlib = o.status === 'fulfilled' ? o.value : null;
  const bnf = b.status === 'fulfilled' ? b.value : null;
  // Diagnostic : un log par source avec son retour brut. Permet de pister un
  // hang ou un payload anormal (a permis de cerner le crash wall-time avant
  // l'ajout de `withTimeout`).
  console.log('SOURCE isbndb', JSON.stringify(isbndb));
  console.log('SOURCE google', JSON.stringify(google));
  console.log('SOURCE openlibrary', JSON.stringify(openlib));
  console.log('SOURCE bnf', JSON.stringify(bnf));

  if (!isbndb && !google && !openlib && !bnf) {
    return json({ error: 'not_found', isbn }, 404);
  }

  const merged = mergeBooks(isbn, { isbndb, google, openlib, bnf });

  // ─── Cleanup Groq automatique ───
  // Best-effort : si Groq répond avec confidence ≥ seuil dans le timeout, on
  // applique le titre/auteurs/catégories nettoyés et on marque ai_cleaned_at.
  // Sinon on conserve le merge brut. Aucun chemin ne fait échouer la résolution
  // — l'utilisateur reçoit toujours un Book.
  const polished = await polishWithGroq(merged);
  const aiCleanedAt = polished ? new Date().toISOString() : null;
  let finalBook = polished ?? merged;

  // ─── Placeholder ISBN-DB ───
  // ISBN-DB renvoie une cover URL même quand l'éditeur n'a pas fourni
  // d'image — l'URL diffère par ISBN mais sert toujours le même placeholder.
  // On compare par hash SHA-256 du body (HEAD-first sur la taille pour skip
  // les vraies covers ≥ 16KB) et on drop la cover si match, pour que
  // `cover_url IS NULL` reflète vraiment l'absence visuelle.
  if (finalBook.coverUrl && (await isIsbnDbPlaceholder(finalBook.coverUrl))) {
    finalBook = { ...finalBook, coverUrl: undefined };
  }

  // Upsert en cache.
  const { error: upsertErr } = await db
    .from('books')
    .upsert({
      isbn: finalBook.isbn,
      title: finalBook.title,
      authors: finalBook.authors,
      pages: finalBook.pages ?? null,
      published_at: finalBook.publishedAt ?? null,
      cover_url: finalBook.coverUrl ?? null,
      source: finalBook.source ?? null,
      categories: finalBook.categories ?? [],
      ai_cleaned_at: aiCleanedAt,
    }, { onConflict: 'isbn' });
  if (upsertErr) console.error('[resolve-book] upsert error', upsertErr);

  return json({ book: finalBook, source: 'fresh' });
});

// Tente un cleanup Groq sur le résultat mergé. Renvoie un Book modifié si
// Groq répond OK avec confidence suffisante, sinon null (caller garde le
// merge brut).
async function polishWithGroq(merged: Book): Promise<Book | null> {
  if (!GROQ_KEY) return null;
  if (!merged.title && merged.authors.length === 0 && (merged.categories ?? []).length === 0) {
    return null;
  }
  let outcome;
  try {
    outcome = await withTimeout(
      cleanWithGroq(
        {
          isbn: merged.isbn,
          title: merged.title,
          authors: merged.authors,
          categories: merged.categories ?? [],
        },
        GROQ_KEY,
      ),
      GROQ_TIMEOUT_MS,
      'groq',
    );
  } catch (e) {
    console.warn('[resolve-book] groq polish skipped', String(e));
    return null;
  }
  if (!outcome.ok) {
    console.warn('[resolve-book] groq error', outcome.error);
    return null;
  }
  if (outcome.cleaned.confidence < GROQ_MIN_CONFIDENCE) {
    console.log('[resolve-book] groq low confidence', outcome.cleaned.confidence);
    return null;
  }
  console.log('[resolve-book] groq cleaned', outcome.cleaned.confidence);
  return {
    ...merged,
    title: outcome.cleaned.title || merged.title,
    authors: outcome.cleaned.authors.length > 0 ? outcome.cleaned.authors : merged.authors,
    categories:
      outcome.cleaned.categories.length > 0
        ? outcome.cleaned.categories
        : merged.categories,
  };
}

// Wrap a promise so it rejects after `ms` instead of hanging forever.
// Used to bound each external fetch — `Promise.allSettled` waits for the
// slowest leg, so a single stuck source would otherwise drag the whole
// function past the edge wall-time limit.
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => {
      console.warn('[resolve-book] timeout', label, ms, 'ms');
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
  sources: { isbndb: Book | null; google: Book | null; openlib: Book | null; bnf: Book | null },
): Book {
  const { isbndb, google, openlib, bnf } = sources;
  // Priorité : ISBN-DB > Google Books > OpenLibrary > BNF.
  // ISBN-DB en top quand la clé est configurée (sinon `isbndb` est null et on
  // retombe naturellement sur l'ordre historique).
  const primary = isbndb ?? google ?? openlib ?? bnf!;
  const source: Book['source'] = isbndb
    ? 'isbndb'
    : google
      ? 'googlebooks'
      : openlib
        ? 'openlibrary'
        : 'bnf';
  const candidates = [isbndb, google, openlib, bnf].filter((x): x is Book => !!x);

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

// ─── ISBN-DB ───
// API : https://api2.isbndb.com/book/{isbn}
// Auth : header `Authorization: <key>` (sans préfixe Bearer).
// Sans clé configurée → no-op (retourne null) pour ne pas spammer 401.

type IsbnDbBook = {
  title?: string;
  title_long?: string;
  authors?: string[];
  pages?: number;
  date_published?: string;
  image?: string;
  subjects?: string[];
  isbn?: string;
  isbn13?: string;
};

async function fetchIsbnDb(isbn: string): Promise<Book | null> {
  if (!ISBNDB_KEY) return null;
  const res = await fetch(`https://api2.isbndb.com/book/${encodeURIComponent(isbn)}`, {
    headers: { Authorization: ISBNDB_KEY },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { book?: IsbnDbBook };
  const v = data.book;
  if (!v) return null;
  const extracted = v.isbn13 ?? v.isbn;
  const year = v.date_published?.match(/\d{4}/)?.[0];
  const cleanedSubjects = filterIsbnDbSubjects(v.subjects ?? []);
  return {
    isbn: extracted ?? isbn,
    title: v.title_long ?? v.title ?? 'Titre inconnu',
    authors: v.authors ?? [],
    pages: typeof v.pages === 'number' && v.pages > 0 ? v.pages : undefined,
    publishedAt: year ?? v.date_published,
    coverUrl: v.image,
    categories: cleanedSubjects.length > 0 ? cleanedSubjects : undefined,
  };
}

// Filtre idiomatique : ISBN-DB scrape les `subjects` depuis les noeuds
// taxonomie Amazon (BSR), ce qui injecte du bruit backend non destiné aux
// utilisateurs : noeuds racine ("Arborist Merchandising Root"), méta-libellés
// ("Self Service", "Subjects"), boutiques opérationnelles ("Specialty
// Boutique", "Featured Categories"). On vire les subjects qui matchent ces
// patterns ; le reste passe tel quel et sera normalisé plus tard par Groq via
// extract-book-metadata si besoin.
//
// Liste tenue volontairement courte pour limiter les faux positifs. À
// compléter au fil des cas observés en prod.
const ISBNDB_SUBJECT_BLACKLIST = [
  'arborist',
  'merchandising',
  'self service',
  'specialty boutique',
  'featured categories',
];

function filterIsbnDbSubjects(raw: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of raw) {
    const t = s.trim();
    if (t.length === 0) continue;
    const lower = t.toLowerCase();
    // Noeud racine taxonomie Amazon → toujours du bruit interne.
    if (lower.endsWith(' root') || lower === 'root') continue;
    // Méta-libellé "Subjects" seul → pas un genre.
    if (lower === 'subjects') continue;
    // Tokens backend connus.
    if (ISBNDB_SUBJECT_BLACKLIST.some((b) => lower.includes(b))) continue;
    // Strip prefix "Genre " (ex: "Genre Fiction" → "Fiction"). Case-insensitive.
    const stripped = /^genre\s+/i.test(t) ? t.replace(/^genre\s+/i, '').trim() : t;
    if (stripped.length === 0) continue;
    // Scinde "xxx & xxx" / "xxx and xxx" en genres indépendants. Amazon
    // taxonomy bourre des composés ("Literature & Fiction", "Teen & Young
    // Adult") qui valent mieux comme tags séparés. Dédoublonnage casse-stable
    // pour éviter "Fiction" + "fiction".
    const parts = stripped.split(/\s+(?:&|and)\s+/i).map((p) => p.trim()).filter(Boolean);
    for (const p of parts) {
      const key = p.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(p);
    }
  }
  return out;
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
