#!/usr/bin/env node
// One-off : applique le cleanup Groq sur les livres existants en DB.
// Idempotent — re-run pour reprendre où il s'est arrêté.
//
// Trois cibles via --target :
//   untouched   (défaut) livres avec ai_cleaned_at IS NULL.
//                         → appel LLM direct (provider configurable), update
//                         partiel des champs.
//   non-isbndb            SELECT * FROM books WHERE source != 'isbndb'
//                         (NULL exclus, comme SQL strict).
//                         Indépendant de ai_cleaned_at.
//                         → re-déclenche l'edge function resolve-book avec
//                         `force=true` : skip le cache, refetch toutes les
//                         sources (ISBN-DB en top priorité), merge, applique
//                         Groq polish (côté edge), upsert. Pipeline complet
//                         identique au flow de scan utilisateur.
//                         Note : ce mode utilise toujours Groq (côté edge),
//                         le flag --provider ne s'applique qu'au mode
//                         untouched.
//   missing-cover         SELECT * FROM books WHERE cover_url IS NULL.
//                         Inclut les livres déjà source='isbndb' (re-call
//                         ISBN-DB pour récupérer l'image manquante).
//                         → même action que non-isbndb : resolve-book
//                         force=true. Si ISBN-DB renvoie une image, le
//                         merge la pose ; sinon Google/OL/BNF en fallback.
//
// Providers LLM supportés (via --provider) :
//   ollama  (défaut) Compute local. API OpenAI-compatible sur
//                    http://localhost:11434/v1/chat/completions. Gratuit, pas
//                    de rate-limit. Pré-requis : `ollama pull llama3.1:8b`.
//   groq             API Groq cloud. Requiert GROQ_API_KEY. Free tier
//                    limité par TPM/RPM, retry-after géré.
//
// Usage :
//   SUPABASE_URL=... \
//   SUPABASE_SERVICE_ROLE_KEY=... \
//   [GROQ_API_KEY=... si --provider=groq] \
//     node scripts/backfill-ai-cleanup.mjs [--target=untouched|non-isbndb]
//                                          [--provider=ollama|groq]
//                                          [--ollama-url=http://localhost:11434]
//                                          [--ollama-model=llama3.1:8b]
//                                          [--limit=N] [--dry-run]
//                                          [--min-confidence=0.6]
//                                          [--throttle-ms=250]
//
// Flags :
//   --target            cible de livres (défaut: untouched)
//   --provider          backend LLM (défaut: ollama)
//   --ollama-url        URL Ollama (défaut: http://localhost:11434)
//   --ollama-model      tag du modèle Ollama (défaut: llama3.1:8b)
//   --limit=N           plafonne le nombre de livres traités (défaut: tous)
//   --dry-run           appelle le LLM mais ne touche pas la DB
//   --min-confidence    seuil pour appliquer le cleanup (défaut: 0.6)
//   --throttle-ms       pause entre deux appels LLM (défaut: 250)
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

const args = parseArgs(process.argv.slice(2));
const LIMIT = args.limit ? Number(args.limit) : null;
const DRY = !!args['dry-run'];
const MIN_CONFIDENCE = args['min-confidence']
  ? Number(args['min-confidence'])
  : 0.6;
const THROTTLE_MS = args['throttle-ms'] ? Number(args['throttle-ms']) : 250;
const TARGET = args.target ?? 'untouched';
if (
  TARGET !== 'untouched' &&
  TARGET !== 'non-isbndb' &&
  TARGET !== 'missing-cover'
) {
  die(
    `--target invalide : ${TARGET} (attendu: untouched | non-isbndb | missing-cover)`,
  );
}
const PROVIDER = args.provider ?? 'ollama';
if (PROVIDER !== 'ollama' && PROVIDER !== 'groq') {
  die(`--provider invalide : ${PROVIDER} (attendu: ollama | groq)`);
}
if (PROVIDER === 'groq' && !GROQ_KEY) {
  die('GROQ_API_KEY requis quand --provider=groq');
}
const OLLAMA_URL = (args['ollama-url'] ?? 'http://localhost:11434').replace(/\/$/, '');
const OLLAMA_MODEL = args['ollama-model'] ?? 'llama3.1:8b';
const PAGE_SIZE = 100;

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

const SYSTEM_PROMPT = `Tu es un assistant qui nettoie des métadonnées de livres provenant de catalogues bibliographiques bruyants (BNF, OpenLibrary, Google Books, ISBN-DB).

Tu reçois un JSON avec : isbn, title, authors[], categories[].

Tu retournes STRICTEMENT un JSON avec ce schéma :
{
  "title": string,         // titre canonique du livre. Voir règles ci-dessous.
  "authors": string[],     // auteurs principaux uniquement, "Prénom Nom" propre. Exclure traducteurs, illustrateurs, préfaciers, éditeurs.
  "categories": string[],  // genres EN FRANÇAIS UNIQUEMENT, jamais en anglais. Courts (1-3 mots), max 5 entrées. Pas de doublons sémantiques. Si une catégorie contient " & " ou " and ", scinde-la en plusieurs entrées indépendantes (ex: "Literature & Fiction" → ["Littérature","Fiction"]). Glossaire EN→FR à appliquer obligatoirement : Magic→Magie, Mystery→Mystère, Horror→Horreur, Adventure→Aventure, Children→Jeunesse, Self-help→Développement personnel, Crime→Polar, Comics→Bande dessinée, Graphic novel→Bande dessinée, Cookbook→Cuisine, Travel→Voyage, History→Histoire, Biography→Biographie, Memoir→Mémoires, Drama→Drame, Comedy→Comédie, Poetry→Poésie, Religion→Religion, Philosophy→Philosophie, Politics→Politique, Health→Santé, Business→Économie, Art→Art, Music→Musique, Sports→Sport, Literature→Littérature, Fiction→Fiction, Non-fiction→Documentaire, Romance→Romance, Thriller→Thriller, Western→Western, Fantasy→Fantasy, Science fiction→Science-fiction, Young adult→Young Adult.
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
  const providerInfo =
    PROVIDER === 'ollama' ? `ollama@${OLLAMA_URL} model=${OLLAMA_MODEL}` : `groq model=${GROQ_MODEL}`;
  log(
    `Backfill IA — target=${TARGET} provider=${providerInfo} limit=${LIMIT ?? '∞'} dryRun=${DRY} minConfidence=${MIN_CONFIDENCE} throttle=${THROTTLE_MS}ms`,
  );

  let processed = 0;
  let applied = 0;
  let lowConf = 0;
  let errors = 0;
  let cursor = null;

  while (true) {
    let q = db
      .from('books')
      .select('isbn, title, authors, categories, source, cover_url')
      .order('isbn', { ascending: true })
      .limit(PAGE_SIZE);
    if (TARGET === 'untouched') {
      q = q.is('ai_cleaned_at', null);
    } else if (TARGET === 'non-isbndb') {
      // SELECT * FROM books WHERE source != 'isbndb'.
      // Comportement SQL strict : NULL exclus (NULL <> 'isbndb' indéterminé).
      q = q.neq('source', 'isbndb');
    } else {
      // missing-cover : re-resolve pour récupérer l'image manquante. Inclut
      // explicitement les rows source='isbndb' (cas où ISBN-DB n'avait pas
      // d'image au premier appel mais en a une maintenant, ou bug ancien).
      q = q.is('cover_url', null);
    }
    if (cursor) q = q.gt('isbn', cursor);

    const { data, error } = await q;
    if (error) die(`fetch books: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const row of data) {
      if (LIMIT && processed >= LIMIT) break;
      processed++;
      cursor = row.isbn;

      if (TARGET === 'non-isbndb' || TARGET === 'missing-cover') {
        // Re-résolution complète : resolve-book refait toutes les sources
        // (avec ISBN-DB en top priorité), merge, applique Groq polish, et
        // upsert. Le force=true skip le cache. Le DRY mode n'écrit pas en DB
        // ici non plus — on regrette de ne pas pouvoir simuler resolve-book
        // sans upsert, mais c'est le tradeoff de réutiliser la fonction.
        if (DRY) {
          log(
            `  · ${row.isbn} (dry) source=${row.source ?? 'NULL'} cover=${row.cover_url ? 'SET' : 'NULL'} title="${row.title ?? ''}" — would re-resolve via resolve-book(force=true)`,
          );
          applied++;
          await sleep(THROTTLE_MS);
          continue;
        }
        const out = await resolveBookForce(row.isbn);
        if (!out.ok) {
          errors++;
          log(`  ✗ ${row.isbn} resolve-book ${out.error}`);
          await sleep(THROTTLE_MS);
          continue;
        }
        const newTitle = out.book?.title ?? '';
        const newSource = out.book?.source ?? 'NULL';
        const newCats = (out.book?.categories ?? []).join(', ');
        const newCover = out.book?.coverUrl ?? null;
        const titleChanged = newTitle !== (row.title ?? '');
        const titleDiff = titleChanged
          ? `\n      title:  "${row.title ?? ''}" → "${newTitle}"`
          : `\n      title:  "${newTitle}" (unchanged)`;
        const sourceLine = `\n      source: ${row.source ?? 'NULL'} → ${newSource}`;
        const catsLine = `\n      cats:   [${(row.categories ?? []).join(', ')}] → [${newCats}]`;
        const coverLine = `\n      cover:  ${row.cover_url ? 'SET' : 'NULL'} → ${newCover ? 'SET' : 'NULL'}`;
        applied++;
        log(`  ✓ ${row.isbn}${titleDiff}${sourceLine}${catsLine}${coverLine}`);
        await sleep(THROTTLE_MS);
        continue;
      }

      // target=untouched : appel LLM direct (provider configurable),
      // update partiel des champs.
      const res = await cleanWithLlm({
        isbn: row.isbn,
        title: row.title ?? '',
        authors: row.authors ?? [],
        categories: row.categories ?? [],
      });

      if (!res.ok) {
        errors++;
        log(`  ✗ ${row.isbn} llm ${res.error}`);
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

// Appelle l'edge function `resolve-book` avec `force=true` pour skipper le
// cache, refetch toutes les sources (ISBN-DB en top priorité) et déclencher
// le Groq polish + upsert côté serveur. Le service role bearer authentifie
// la requête comme superuser ; resolve-book n'a pas de gate admin/user.
async function resolveBookForce(isbn) {
  const url = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/resolve-book`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${SERVICE_ROLE}`,
        apikey: SERVICE_ROLE,
      },
      body: JSON.stringify({ isbn, force: true }),
    });
  } catch (e) {
    return { ok: false, error: `fetch:${e?.message ?? e}` };
  }
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    return { ok: false, error: `http_${res.status}:${t.slice(0, 160)}` };
  }
  let payload;
  try {
    payload = await res.json();
  } catch {
    return { ok: false, error: 'invalid_json' };
  }
  if (!payload?.book) {
    return { ok: false, error: payload?.error ?? 'no_book' };
  }
  return { ok: true, book: payload.book, source: payload.source };
}

// Dispatcher : appelle Groq cloud ou Ollama local selon --provider.
async function cleanWithLlm(input) {
  return PROVIDER === 'ollama' ? cleanWithOllama(input) : cleanWithGroq(input);
}

// Ollama via API OpenAI-compatible. Pas d'auth, pas de rate-limit.
// Compute local → latence dépend de la machine (typique ~1-5s par appel sur
// CPU récent / Apple Silicon avec llama3.1:8b q4).
async function cleanWithOllama(input) {
  const normalized = normalizeInput(input);
  if (!normalized) return { ok: false, error: 'empty_input' };

  let res;
  try {
    res = await fetch(`${OLLAMA_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
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
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    return { ok: false, error: `ollama_${res.status}:${t.slice(0, 160)}` };
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

async function cleanWithGroq(input) {
  const normalized = normalizeInput(input);
  if (!normalized) return { ok: false, error: 'empty_input' };

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

// Normalise l'input avant envoi au LLM (trim, filtre types). Retourne null
// si tout est vide → caller short-circuite avec error 'empty_input'.
function normalizeInput(input) {
  const out = {
    isbn: String(input.isbn ?? '').trim(),
    title: String(input.title ?? '').trim(),
    authors: Array.isArray(input.authors)
      ? input.authors.filter((s) => typeof s === 'string')
      : [],
    categories: Array.isArray(input.categories)
      ? input.categories.filter((s) => typeof s === 'string')
      : [],
  };
  if (!out.title && out.authors.length === 0 && out.categories.length === 0) {
    return null;
  }
  return out;
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
