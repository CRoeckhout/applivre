#!/usr/bin/env node
// Copie les migrations SQL de @grimolia/social vers supabase/migrations
// avec un numéro libre dans la séquence de l'app. Idempotent.
//
// Convention : un fichier de migration sociale a la forme `NNNN_social_*.sql`
// dans le package, et garde le même nom (`*_social_*.sql`) côté app, avec un
// nouveau préfixe numérique. C'est ce stem qui sert de clé d'unicité.

import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PKG_MIGRATIONS = join(ROOT, 'packages', 'social', 'migrations');
const APP_MIGRATIONS = join(ROOT, 'supabase', 'migrations');

if (!existsSync(PKG_MIGRATIONS)) {
  console.error(`[social-sync] missing ${PKG_MIGRATIONS}`);
  process.exit(1);
}
mkdirSync(APP_MIGRATIONS, { recursive: true });

/** Stem d'un nom de migration (sans le préfixe numérique). */
const stemOf = name => name.replace(/^\d+_/, '');

/** Liste les stems déjà présents côté app. */
const alreadyCopied = new Set(
  readdirSync(APP_MIGRATIONS)
    .filter(f => f.endsWith('.sql'))
    .map(stemOf),
);

/** Plus grand numéro de migration côté app, ou 0 si vide. */
let nextNum = readdirSync(APP_MIGRATIONS)
  .filter(f => /^\d+_.*\.sql$/.test(f))
  .map(f => parseInt(f.match(/^(\d+)_/)[1], 10))
  .reduce((acc, n) => Math.max(acc, n), 0);

const pad = n => String(n).padStart(4, '0');

const candidates = readdirSync(PKG_MIGRATIONS)
  .filter(f => f.endsWith('.sql'))
  .sort();

let copied = 0;
for (const file of candidates) {
  const stem = stemOf(file);
  if (alreadyCopied.has(stem)) {
    console.log(`[social-sync] skip ${file} (already copied as *_${stem})`);
    continue;
  }
  nextNum += 1;
  const target = `${pad(nextNum)}_${stem}`;
  copyFileSync(join(PKG_MIGRATIONS, file), join(APP_MIGRATIONS, target));
  console.log(`[social-sync] copied ${file} → ${target}`);
  copied += 1;
}

console.log(`[social-sync] done (${copied} new migration(s))`);
