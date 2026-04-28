#!/usr/bin/env node
// One-off : applique le cleanup Groq sur tous les livres existants en DB
// (ai_cleaned_at IS NULL). Idempotent — re-run pour reprendre où il s'est
// arrêté ; les livres déjà nettoyés sont skippés via le filtre SQL.
//
// Usage :
//   SUPABASE_URL=... \
//   SUPABASE_SERVICE_ROLE_KEY=... \
//   GROQ_API_KEY=... \
//     node scripts/backfill-ai-cleanup.mjs [--limit=N] [--dry-run]
//                                          [--min-confidence=0.6]
//                                          [--throttle-ms=250]
//
// Flags :
//   --limit=N           plafonne le nombre de livres traités (défaut: tous)
//   --dry-run           appelle Groq mais ne touche pas la DB
//   --min-confidence    seuil pour appliquer le cleanup (défaut: 0.6)
//   --throttle-ms       pause entre deux appels Groq (défaut: 250)
//
// Le SYSTEM_PROMPT et le modèle sont une copie de
// `supabase/functions/_shared/groq-cleanup.ts`. Garder synchro.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GROQ_KEY = process.env.GROQ_API_KEY;

if (!SUPABASE_URL) die('SUPABASE_URL (ou EXPO_PUBLIC_SUPABASE_URL) requis');
if (!SERVICE_ROLE) die('SUPABASE_SERVICE_ROLE_KEY requis');
if (!GROQ_KEY) die('GROQ_API_KEY requis');

const args = parseArgs(process.argv.slice(2));
const LIMIT = args.limit ? Number(args.limit) : null;
const DRY = !!args['dry-run'];
const MIN_CONFIDENCE = args['min-confidence']
  ? Number(args['min-confidence'])
  : 0.6;
const THROTTLE_MS = args['throttle-ms'] ? Number(args['throttle-ms']) : 250;
const PAGE_SIZE = 100;

const GROQ_MODEL = 'llama-3.1-8b-instant';
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

const SYSTEM_PROMPT = `Tu es un assistant qui nettoie des métadonnées de livres provenant de catalogues bibliographiques bruyants (BNF, OpenLibrary, Google Books, ISBN-DB).

Tu reçois un JSON avec : isbn, title, authors[], categories[].

Tu retournes STRICTEMENT un JSON avec ce schéma :
{
  "title": string,         // titre canonique du livre. Voir règles ci-dessous.
  "authors": string[],     // auteurs principaux uniquement, "Prénom Nom" propre. Exclure traducteurs, illustrateurs, préfaciers, éditeurs.
  "categories": string[],  // genres normalisés en français, courts (1-3 mots), max 5 entrées. Pas de doublons sémantiques. Si une catégorie contient " & " ou " and ", scinde-la en plusieurs entrées indépendantes (ex: "Literature & Fiction" → ["Littérature","Fiction"]).
  "confidence": number     // 0..1 — ta confiance dans le résultat global.
}

Règles titre :
- Garde le titre principal et, s'il existe, le sous-titre lisible (séparé par " : ", " - ", " — ").
- Garde la mention de tome/volume si elle est dans le titre source : "Tome N", "T N", "Volume N", "Vol. N". Préfère le format "Tome N" canonique. Garde aussi le titre du tome (ex: "Tome 2 : Les Braises de la Reine").
- Supprime toute mention d'édition ou de format : "édition reliée", "édition collector", "édition de poche", "édition spéciale", "édition limitée", "édition illustrée", "édition Jaspage", "édition originale", "broché", "relié", "grand format", "poche", "(édition X)", "(version Y)", etc. Cas-insensible, avec ou sans accents, avec ou sans parenthèses.
- Supprime les chiffres entre parenthèses redondants avec le tome déjà mentionné : "Tome 2 ... (2)" → "Tome 2 ...".
- Supprime les mentions de traducteur, illustrateur, préfacier, série en préfixe/suffixe ainsi que les séparateurs orphelins (" / ", " ; ", " . ", points isolés).
- Normalise les espaces : un seul espace entre les mots, pas d'espace avant la ponctuation française autre que celle prévue (": " "; " "! " "? ").
- Conserve la casse d'origine pour le titre et garde les accents et apostrophes français (' " ' ").

Exemples :
Input : {"title":"Cinder / Marissa Meyer ; traduit de l'anglais (États-Unis) par Guillaume Fournier","authors":["Marissa Meyer","Guillaume Fournier"],"categories":["Young adult fiction","Science fiction"]}
Output : {"title":"Cinder","authors":["Marissa Meyer"],"categories":["Young Adult","Science-fiction"],"confidence":0.95}

Input : {"title":"L'Étranger","authors":["Albert Camus"],"categories":["Fiction"]}
Output : {"title":"L'Étranger","authors":["Albert Camus"],"categories":["Roman"],"confidence":0.9}

Input : {"title":"Les Sept Maris d'Evelyn Hugo","authors":["Taylor Jenkins Reid"],"categories":["Literature & Fiction","Genre Fiction","Teen & Young Adult","Science Fiction & Fantasy"]}
Output : {"title":"Les Sept Maris d'Evelyn Hugo","authors":["Taylor Jenkins Reid"],"categories":["Littérature","Fiction","Young Adult","Science-fiction","Fantasy"],"confidence":0.9}

Input : {"title":"Peau d'âme - Tome 2 Les Braises de la Reine (2)","authors":["Pierre Bottero"],"categories":["Fantasy"]}
Output : {"title":"Peau d'âme - Tome 2 : Les Braises de la Reine","authors":["Pierre Bottero"],"categories":["Fantasy"],"confidence":0.9}

Input : {"title":"Le Pont des tempêtes, T5 : Le Trône tourmenté (édition reliée)","authors":["Robin Hobb"],"categories":["Fantasy"]}
Output : {"title":"Le Pont des tempêtes, Tome 5 : Le Trône tourmenté","authors":["Robin Hobb"],"categories":["Fantasy"],"confidence":0.9}

Input : {"title":"Le serpent et le descendant de la Nuit Edition Jaspage","authors":["Anne Robillard"],"categories":["Fantasy"]}
Output : {"title":"Le serpent et le descendant de la Nuit","authors":["Anne Robillard"],"categories":["Fantasy"],"confidence":0.9}

Input : {"title":"Les Mondes d'Ewilan L'intégrale . Edition collector","authors":["Pierre Bottero"],"categories":["Fantasy","Young adult"]}
Output : {"title":"Les Mondes d'Ewilan : L'intégrale","authors":["Pierre Bottero"],"categories":["Fantasy","Young Adult"],"confidence":0.9}

Si l'input est vide ou inexploitable, retourne le titre/auteurs tels quels et confidence: 0.

Ne renvoie QUE le JSON, sans texte autour, sans markdown.`;

const db = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

async function main() {
  log(
    `Backfill IA — limit=${LIMIT ?? '∞'} dryRun=${DRY} minConfidence=${MIN_CONFIDENCE} throttle=${THROTTLE_MS}ms`,
  );

  let processed = 0;
  let applied = 0;
  let lowConf = 0;
  let errors = 0;
  let cursor = null;

  while (true) {
    let q = db
      .from('books')
      .select('isbn, title, authors, categories')
      .is('ai_cleaned_at', null)
      .order('isbn', { ascending: true })
      .limit(PAGE_SIZE);
    if (cursor) q = q.gt('isbn', cursor);

    const { data, error } = await q;
    if (error) die(`fetch books: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const row of data) {
      if (LIMIT && processed >= LIMIT) break;
      processed++;
      cursor = row.isbn;

      const res = await cleanWithGroq({
        isbn: row.isbn,
        title: row.title ?? '',
        authors: row.authors ?? [],
        categories: row.categories ?? [],
      });

      if (!res.ok) {
        errors++;
        log(`  ✗ ${row.isbn} groq ${res.error}`);
        await sleep(THROTTLE_MS);
        continue;
      }

      if (res.cleaned.confidence < MIN_CONFIDENCE) {
        lowConf++;
        log(`  ~ ${row.isbn} skip conf=${res.cleaned.confidence}`);
        await sleep(THROTTLE_MS);
        continue;
      }

      const patch = {
        title: res.cleaned.title || row.title,
        authors:
          res.cleaned.authors.length > 0
            ? res.cleaned.authors
            : (row.authors ?? []),
        categories:
          res.cleaned.categories.length > 0
            ? res.cleaned.categories
            : (row.categories ?? []),
        ai_cleaned_at: new Date().toISOString(),
      };

      const titleChanged = patch.title !== (row.title ?? '');
      const titleDiff = titleChanged
        ? `\n      title: "${row.title ?? ''}" → "${patch.title}"`
        : `\n      title: "${patch.title}" (unchanged)`;
      const catsLine = `\n      cats:  [${(row.categories ?? []).join(', ')}] → [${patch.categories.join(', ')}]`;

      if (DRY) {
        applied++;
        log(
          `  ✓ ${row.isbn} (dry) conf=${res.cleaned.confidence}${titleDiff}${catsLine}`,
        );
      } else {
        const { error: upErr } = await db
          .from('books')
          .update(patch)
          .eq('isbn', row.isbn);
        if (upErr) {
          errors++;
          log(`  ✗ ${row.isbn} update ${upErr.message}`);
        } else {
          applied++;
          log(
            `  ✓ ${row.isbn} conf=${res.cleaned.confidence}${titleDiff}${catsLine}`,
          );
        }
      }

      await sleep(THROTTLE_MS);
    }

    if (LIMIT && processed >= LIMIT) break;
    if (data.length < PAGE_SIZE) break;
  }

  log('');
  log(
    `Done. processed=${processed} applied=${applied} lowConf=${lowConf} errors=${errors} dryRun=${DRY}`,
  );
}

async function cleanWithGroq(input) {
  const normalized = {
    isbn: String(input.isbn ?? '').trim(),
    title: String(input.title ?? '').trim(),
    authors: Array.isArray(input.authors)
      ? input.authors.filter((s) => typeof s === 'string')
      : [],
    categories: Array.isArray(input.categories)
      ? input.categories.filter((s) => typeof s === 'string')
      : [],
  };
  if (
    !normalized.title &&
    normalized.authors.length === 0 &&
    normalized.categories.length === 0
  ) {
    return { ok: false, error: 'empty_input' };
  }

  // Groq free tier limite par TPM (~6k tokens/min sur llama-3.1-8b-instant).
  // Notre prompt système est gros (~600 tokens) → on tape la limite vite.
  // Sur 429 : on respecte `retry-after` si fourni, sinon backoff exponentiel
  // (10s, 20s, 40s) — jusqu'à MAX_RETRIES tentatives.
  const MAX_RETRIES = 4;
  let attempt = 0;
  while (true) {
    let res;
    try {
      res = await fetch(GROQ_ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${GROQ_KEY}`,
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: JSON.stringify(normalized) },
          ],
        }),
      });
    } catch (e) {
      return { ok: false, error: `fetch:${e?.message ?? e}` };
    }

    if (res.status === 429) {
      if (attempt >= MAX_RETRIES) return { ok: false, error: 'rate_limited' };
      const retryAfterHeader = res.headers.get('retry-after');
      const retryAfterSec = retryAfterHeader
        ? Number(retryAfterHeader)
        : Number.NaN;
      const waitMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0
        ? Math.ceil(retryAfterSec * 1000)
        : Math.min(60_000, 10_000 * 2 ** attempt);
      log(`    … rate-limited, retry in ${Math.round(waitMs / 1000)}s (attempt ${attempt + 1}/${MAX_RETRIES})`);
      await sleep(waitMs);
      attempt++;
      continue;
    }
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      return { ok: false, error: `upstream_${res.status}:${t.slice(0, 120)}` };
    }
    let payload;
    try {
      payload = await res.json();
    } catch {
      return { ok: false, error: 'invalid_json' };
    }
    const content = payload?.choices?.[0]?.message?.content ?? '';
    const cleaned = parseCleaned(content);
    if (!cleaned) return { ok: false, error: 'invalid_response' };
    return { ok: true, cleaned };
  }
}

function parseCleaned(raw) {
  try {
    const obj = JSON.parse(raw);
    if (typeof obj.title !== 'string') return null;
    if (!Array.isArray(obj.authors)) return null;
    if (!Array.isArray(obj.categories)) return null;
    const confidence =
      typeof obj.confidence === 'number' && Number.isFinite(obj.confidence)
        ? Math.max(0, Math.min(1, obj.confidence))
        : 0;
    return {
      title: obj.title.trim(),
      authors: obj.authors
        .filter((s) => typeof s === 'string')
        .map((s) => s.trim()),
      categories: obj.categories
        .filter((s) => typeof s === 'string')
        .map((s) => s.trim()),
      confidence,
    };
  } catch {
    return null;
  }
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
