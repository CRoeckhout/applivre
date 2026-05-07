#!/usr/bin/env node
/**
 * Régénère les xattrs `user.supabase.*` sur les fichiers du volume Storage
 * local à partir des métadonnées en DB (storage.objects.metadata).
 *
 * Pourquoi : Supabase Storage v3 (file backend) lit content-type / cache-control
 * / etag via `getxattr()`. Si les xattrs sont perdus (ex: tar/untar du volume
 * sans `--xattrs`), l'API renvoie 500 ENODATA sur tous les GET.
 *
 * Ce que ça fait :
 *   - SELECT bucket_id, name, version, metadata FROM storage.objects
 *   - pour chaque ligne : setfattr user.supabase.{content-type,cache-control,etag}
 *     sur /mnt/stub/stub/{bucket_id}/{name}/{version} dans le container storage
 *
 * Idempotent : setfattr écrase la valeur existante si l'attribut est déjà là.
 *
 * Usage :
 *   node scripts/regen-storage-xattrs.mjs [--dry-run] [--bucket <name>]
 */

import { spawnSync } from 'node:child_process'

const argv = process.argv.slice(2)
const DRY_RUN = argv.includes('--dry-run')
const bucketIdx = argv.indexOf('--bucket')
const bucketFilter = bucketIdx >= 0 ? argv[bucketIdx + 1] : null

const DB_URL = process.env.LOCAL_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const STORAGE_CONTAINER = process.env.SUPABASE_STORAGE_CONTAINER ?? 'supabase_storage_grimolia'
const VOLUME_ROOT = '/mnt/stub/stub'

// Garde-fous : refus si on cible autre chose qu'une URL Postgres locale.
if (!/127\.0\.0\.1|localhost/.test(DB_URL)) {
  console.error('Refusing: LOCAL_DB_URL must point to localhost (this is local-only).')
  process.exit(1)
}

// 1. Vérifier que setfattr est dispo dans le container.
const probe = spawnSync('docker', ['exec', STORAGE_CONTAINER, 'sh', '-c', 'command -v setfattr'], {
  encoding: 'utf8',
})
if (probe.status !== 0 || !probe.stdout.trim()) {
  console.error(`setfattr absent du container ${STORAGE_CONTAINER}.`)
  console.error('Installe-le : docker exec ' + STORAGE_CONTAINER + ' apk add --no-cache attr')
  process.exit(1)
}

// 2. Lire storage.objects avec les 3 champs de metadata qu'on doit projeter.
const where = bucketFilter ? `WHERE bucket_id = '${bucketFilter.replace(/'/g, "''")}'` : ''
const sql = `
  SELECT
    bucket_id,
    name,
    version,
    coalesce(metadata->>'mimetype',     'application/octet-stream'),
    coalesce(metadata->>'cacheControl', 'no-cache'),
    coalesce(metadata->>'eTag',         '')
  FROM storage.objects
  ${where}
  ORDER BY bucket_id, name
`
const q = spawnSync('psql', [DB_URL, '-At', '-F\t', '-c', sql], { encoding: 'utf8' })
if (q.status !== 0) {
  console.error('psql failed:', q.stderr)
  process.exit(1)
}

const rows = q.stdout
  .split('\n')
  .filter((l) => l.length > 0)
  .map((l) => l.split('\t'))

console.log(`${rows.length} objects to process${bucketFilter ? ` (bucket=${bucketFilter})` : ''}`)
if (DRY_RUN) console.log('[DRY RUN] no setfattr will be executed')

if (rows.length === 0) process.exit(0)

// 3. Construire un script shell qu'on pipe dans le container — beaucoup plus
//    rapide que N appels docker exec séparés.
const lines = ['set -e', `cd ${VOLUME_ROOT}`]
let skipped = 0
for (const [bucket, name, version, mime, cache, etag] of rows) {
  if (!version) {
    skipped++
    continue
  }
  // Path: {bucket}/{name}/{version}. name peut contenir des / (sous-dossiers).
  const path = `${bucket}/${name}/${version}`
  // Échappe les single-quotes dans les valeurs pour le shell.
  const sq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`
  lines.push(`if [ -f ${sq(path)} ]; then`)
  lines.push(`  setfattr -n user.supabase.content-type  -v ${sq(mime)}  ${sq(path)}`)
  lines.push(`  setfattr -n user.supabase.cache-control -v ${sq(cache)} ${sq(path)}`)
  if (etag) {
    lines.push(`  setfattr -n user.supabase.etag        -v ${sq(etag)} ${sq(path)}`)
  }
  lines.push(`else`)
  lines.push(`  echo "MISSING: ${path}" >&2`)
  lines.push(`fi`)
}
const script = lines.join('\n')

if (DRY_RUN) {
  console.log(`Would run ${rows.length - skipped} object(s) through setfattr.`)
  console.log('First 3 lines of generated shell:')
  console.log(script.split('\n').slice(0, 12).join('\n'))
  process.exit(0)
}

const run = spawnSync('docker', ['exec', '-i', STORAGE_CONTAINER, 'sh'], {
  input: script,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
})

if (run.stderr) process.stderr.write(run.stderr)
if (run.status !== 0) {
  console.error(`docker exec exited ${run.status}`)
  process.exit(run.status ?? 1)
}

const missing = (run.stderr ?? '').split('\n').filter((l) => l.startsWith('MISSING:')).length
console.log(`Done — ${rows.length - skipped - missing} xattrs sets applied, ${missing} files missing on disk.`)
