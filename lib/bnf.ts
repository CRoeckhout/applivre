import type { SearchResult } from '@/lib/openlibrary';
import type { Book } from '@/types/book';
import { XMLParser } from 'fast-xml-parser';

// SRU (Search/Retrieve URL) v1.2 du catalogue général BNF.
// Doc : https://api.bnf.fr/api-sru-du-catalogue-general-de-la-bnf
//
// Le schéma dublincore est beaucoup plus simple à parser que UNIMARC
// et suffit pour nos besoins : titre, auteur, ISBN, date, pages.
const BASE = 'https://catalogue.bnf.fr/api/SRU';

const parser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
});

const DEFAULT_TIMEOUT_MS = 2500;

// Certaines valeurs peuvent arriver en string ou en { '#text': '...' }
// selon que l'élément avait des attributs ou non.
type XmlValue = string | { '#text'?: string } | undefined;

function flatten(v: XmlValue | XmlValue[]): string[] {
  const arr = Array.isArray(v) ? v : v ? [v] : [];
  return arr
    .map((x) => (typeof x === 'string' ? x : typeof x?.['#text'] === 'string' ? x['#text']! : ''))
    .filter((s) => s.length > 0);
}

function first(v: XmlValue | XmlValue[]): string | undefined {
  return flatten(v)[0];
}

async function sruFetch(cql: string, max: number, timeoutMs: number): Promise<unknown[]> {
  const params = new URLSearchParams({
    version: '1.2',
    operation: 'searchRetrieve',
    query: cql,
    recordSchema: 'dublincore',
    maximumRecords: String(max),
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${BASE}?${params}`, { signal: controller.signal });
    if (!res.ok) return [];
    const xml = await res.text();
    const json = parser.parse(xml) as {
      searchRetrieveResponse?: { records?: { record?: unknown | unknown[] } };
    };
    const rec = json?.searchRetrieveResponse?.records?.record;
    if (!rec) return [];
    return Array.isArray(rec) ? rec : [rec];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function extractDc(record: unknown): Record<string, XmlValue | XmlValue[]> {
  const r = record as { recordData?: { dc?: Record<string, XmlValue | XmlValue[]> } } | undefined;
  return r?.recordData?.dc ?? {};
}

function extractIsbn(v: XmlValue | XmlValue[]): string | undefined {
  for (const s of flatten(v)) {
    const m = s.match(/(?:ISBN|ISSN)\s*:?\s*([\d\-Xx]{10,20})/);
    if (m) {
      const digits = m[1].replace(/[^0-9Xx]/g, '');
      if (digits.length === 10 || digits.length === 13) return digits;
    }
  }
  return undefined;
}

function extractPages(v: XmlValue | XmlValue[]): number | undefined {
  for (const s of flatten(v)) {
    const m = s.match(/(\d{1,5})\s*p/);
    if (m) return parseInt(m[1], 10);
  }
  return undefined;
}

function extractYear(v: XmlValue | XmlValue[]): string | undefined {
  for (const s of flatten(v)) {
    const m = s.match(/(\d{4})/);
    if (m) return m[1];
  }
  return undefined;
}

function cleanAuthor(raw: string): string {
  // "Saint-Exupéry, Antoine de (1900-1944). Auteur du texte" → "Saint-Exupéry, Antoine de"
  return raw
    .replace(/\s*\([^)]*\)\s*/g, '')
    .replace(/\.\s*[^.]+$/, '')
    .trim();
}

function extractAuthors(v: XmlValue | XmlValue[]): string[] {
  return flatten(v).map(cleanAuthor).filter(Boolean);
}

function recordToBook(record: unknown): Book | null {
  const dc = extractDc(record);
  const isbn = extractIsbn(dc.identifier);
  if (!isbn) return null;

  return {
    isbn,
    title: first(dc.title) ?? 'Titre inconnu',
    authors: extractAuthors(dc.creator),
    pages: extractPages(dc.format),
    publishedAt: extractYear(dc.date),
    // La BNF ne fournit pas de couverture. L'agrégateur gère la chaîne de
    // fallback pour combler si besoin.
    coverUrl: undefined,
    source: 'bnf',
  };
}

export async function fetchBookByIsbnBnf(
  isbn: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Book | null> {
  const clean = isbn.replace(/[^0-9X]/gi, '');
  const records = await sruFetch(`bib.isbn adj "${clean}"`, 1, timeoutMs);
  for (const r of records) {
    const book = recordToBook(r);
    if (book) return book;
  }
  return null;
}

export async function searchBooksBnf(
  query: string,
  limit = 20,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<SearchResult[]> {
  const q = query.trim().replace(/"/g, '');
  if (q.length < 2) return [];
  const records = await sruFetch(`bib.anywhere all "${q}"`, limit, timeoutMs);
  const results: SearchResult[] = [];
  for (const r of records) {
    const book = recordToBook(r);
    if (book) {
      results.push({
        isbn: book.isbn,
        title: book.title,
        authors: book.authors,
        coverUrl: book.coverUrl,
        year: book.publishedAt ? parseInt(book.publishedAt, 10) || undefined : undefined,
        pages: book.pages,
      });
    }
  }
  return results;
}
