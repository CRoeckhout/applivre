#!/usr/bin/env node
// One-off : NULL-out cover_url pour les livres existants dont la cover
// pointe vers le placeholder ISBN-DB (image servie quand l'éditeur n'a
// pas fourni de visuel). L'URL est unique par livre mais l'image bytes
// sont identiques — on compare par hash SHA-256.
//
// Idempotent : re-run pour reprendre. Les livres déjà NULL ne sont pas
// re-fetched (filtre SQL `cover_url ilike '%images.isbndb.com%'`).
//
// Hash de référence dupliqué depuis
// `supabase/functions/_shared/isbndb-placeholder.ts`. Garder synchro.
//
// Usage :
//   SUPABASE_URL=... \
//   SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/backfill-isbndb-placeholder.mjs [--limit=N] [--dry-run]
//                                                  [--throttle-ms=100]
//                                                  [--concurrency=4]
//
// Flags :
//   --limit=N           plafonne le nombre de livres traités (défaut: tous)
//   --dry-run           hash mais ne touche pas la DB
//   --throttle-ms       pause entre deux batchs (défaut: 100)
//   --concurrency       fetchs parallèles par batch (défaut: 4)

import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const ISBNDB_PLACEHOLDER_SHA256 =
  '56c3e12f87260f78db39b9deeb0d04194e110c99702e6483963f2ab009bfea15';

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) die('SUPABASE_URL (ou EXPO_PUBLIC_SUPABASE_URL) requis');
if (!SERVICE_ROLE) die('SUPABASE_SERVICE_ROLE_KEY requis');

const args = parseArgs(process.argv.slice(2));
const LIMIT = args.limit ? Number(args.limit) : null;
const DRY = !!args['dry-run'];
const VERBOSE = !!args.verbose;
const THROTTLE_MS = args['throttle-ms'] ? Number(args['throttle-ms']) : 100;
const CONCURRENCY = args.concurrency ? Number(args.concurrency) : 4;
const PAGE_SIZE = 200;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  log(
    `[backfill-isbndb-placeholder] dry=${DRY} limit=${LIMIT ?? 'all'} concurrency=${CONCURRENCY} throttle=${THROTTLE_MS}ms`,
  );

  let processed = 0;
  let matched = 0;
  let cleared = 0;
  let errors = 0;
  const sizeBuckets = { '<5KB': 0, '5-10KB': 0, '10-30KB': 0, '>30KB': 0 };
  const smallSamples = [];
  // Pagination cursor-based : éviter le shift de pages quand on UPDATE
  // cover_url=NULL (la row sort du filtre, range(N, M) saute des éléments).
  let cursor = null;

  while (true) {
    if (LIMIT && processed >= LIMIT) break;

    const remaining = LIMIT ? LIMIT - processed : PAGE_SIZE;
    const pageSize = Math.min(PAGE_SIZE, remaining);

    let req = supabase
      .from('books')
      .select('isbn, cover_url')
      .ilike('cover_url', '%images.isbndb.com%')
      .order('isbn', { ascending: true })
      .limit(pageSize);
    if (cursor) req = req.gt('isbn', cursor);

    const { data, error } = await req;
    if (error) die(`select failed: ${error.message}`);
    if (!data || data.length === 0) break;

    // Process en parallèle borné par CONCURRENCY.
    const results = await runParallel(data, CONCURRENCY, async (row) => {
      const info = await fetchAndHash(row.cover_url);
      const isPlaceholder = info && info.hash === ISBNDB_PLACEHOLDER_SHA256;
      if (info) {
        if (info.size < 5000) sizeBuckets['<5KB']++;
        else if (info.size < 10000) sizeBuckets['5-10KB']++;
        else if (info.size < 30000) sizeBuckets['10-30KB']++;
        else sizeBuckets['>30KB']++;
        if (info.size < 10000 && smallSamples.length < 20) {
          smallSamples.push({
            isbn: row.isbn,
            size: info.size,
            hash: info.hash,
            url: row.cover_url,
          });
        }
      }
      if (VERBOSE && info) {
        log(
          `  · ${row.isbn} ${info.size}B sha256=${info.hash} ${isPlaceholder ? 'MATCH' : 'no-match'} ${row.cover_url}`,
        );
      }
      return { isbn: row.isbn, isPlaceholder };
    });

    for (const r of results) {
      processed++;
      if (r === null) {
        errors++;
        continue;
      }
      if (r.isPlaceholder) {
        matched++;
        if (!DRY) {
          const { error: upErr } = await supabase
            .from('books')
            .update({ cover_url: null })
            .eq('isbn', r.isbn);
          if (upErr) {
            errors++;
            log(`  ✗ ${r.isbn} update failed: ${upErr.message}`);
            continue;
          }
        }
        cleared++;
        log(`  ✓ ${r.isbn} ${DRY ? '(dry-run)' : 'cleared'}`);
      }
    }

    cursor = data[data.length - 1].isbn;
    log(
      `[batch] processed=${processed} matched=${matched} cleared=${cleared} errors=${errors} cursor=${cursor}`,
    );

    await sleep(THROTTLE_MS);
  }

  log(
    `[done] processed=${processed} matched=${matched} cleared=${cleared} errors=${errors}`,
  );
  log(`[size buckets] ${JSON.stringify(sizeBuckets)}`);
  if (smallSamples.length > 0) {
    log('[suspects <10KB — candidats placeholder]');
    for (const s of smallSamples) {
      log(`  ${s.isbn} ${s.size}B sha256=${s.hash} ${s.url}`);
    }
  }
}

// HEAD-first : skip le GET sur les vraies covers (≥ 16KB observé). On ne
// hash que les images < 10KB qui sont les candidats placeholder.
const PLACEHOLDER_MAX_BYTES = 10_000;

async function fetchAndHash(url) {
  try {
    const head = await fetch(url, { method: 'HEAD' });
    if (!head.ok) return null;
    const len = Number(head.headers.get('content-length') ?? '0');
    if (len === 0) return null;
    // Trop grand pour être un placeholder → on retourne juste la taille,
    // pas le hash (pas besoin de matcher, et stats sizeBuckets restent
    // alimentées dans le caller via `info.size`).
    if (len > PLACEHOLDER_MAX_BYTES) {
      return { hash: null, size: len };
    }
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const hash = createHash('sha256').update(buf).digest('hex');
    return { hash, size: buf.length };
  } catch {
    return null;
  }
}

async function runParallel(items, concurrency, worker) {
  const results = new Array(items.length);
  let idx = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = idx++;
      if (i >= items.length) return;
      try {
        results[i] = await worker(items[i]);
      } catch {
        results[i] = null;
      }
    }
  });
  await Promise.all(runners);
  return results;
}

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) out[m[1]] = m[2] ?? true;
  }
  return out;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function log(msg) {
  console.log(msg);
}

function die(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

main().catch((e) => die(e?.message ?? String(e)));
