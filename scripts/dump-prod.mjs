#!/usr/bin/env node
/**
 * Dump complet de la prod : DB (pg_dump) + Storage (tar.gz au format Supabase).
 * Strictement read-only. Aucun write, upsert ou delete sur la prod.
 *
 * Sortie :
 *   backups/prod-db-<TS>.dump                    pg_dump -Fc, restorable via pg_restore
 *   backups/prod-storage-files-<TS>.tar.gz       layout Supabase Storage interne :
 *                                                  <bucket>/<chemin-logique>/<version-uuid>
 *
 * Le tar.gz peut ensuite être :
 *  - extrait en fichiers nommés (avec extensions) via `extract-storage-files.mjs`
 *  - restauré directement dans un volume Docker Supabase local (compatibilité 1:1
 *    avec le dump SQL si on connaît les version_ids)
 *
 * Pré-requis (env vars) :
 *   SUPABASE_PROD_DB_URL              postgresql://postgres.<ref>:<password>@aws-1-eu-central-1.pooler.supabase.com:5432/postgres
 *   SUPABASE_PROD_URL                 https://<ref>.supabase.co  (ou EXPO_PUBLIC_SUPABASE_URL du .env)
 *   SUPABASE_PROD_SERVICE_ROLE_KEY    Dashboard → API → service_role
 *
 * Le storage utilise psql pour récupérer (name, version) depuis storage.objects,
 * donc SUPABASE_PROD_DB_URL est requis dès qu'on dump le storage (sauf si --skip-storage).
 *
 * Flags optionnels :
 *   --skip-db        ne dump pas la DB
 *   --skip-storage   ne dump pas les fichiers
 *   --buckets a,b,c  ne dump que ces buckets
 *
 * Usage :
 *   node --env-file=.env.local scripts/dump-prod.mjs
 *   node --env-file=.env.local scripts/dump-prod.mjs --buckets music-theme-tracks
 */

import { createClient } from '@supabase/supabase-js'
import { spawn, spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, writeFile, stat, rm } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'

const argv = process.argv.slice(2)
const SKIP_DB = argv.includes('--skip-db')
const SKIP_STORAGE = argv.includes('--skip-storage')
const BUCKET_FILTER = (() => {
  const i = argv.indexOf('--buckets')
  return i >= 0 ? argv[i + 1].split(',').map((s) => s.trim()) : null
})()

const TS = new Date()
  .toISOString()
  .replace(/[-:]/g, '')
  .replace(/\..+/, '')
  .replace('T', '-')

const PROD_DB_URL = process.env.SUPABASE_PROD_DB_URL
const PROD_URL =
  process.env.SUPABASE_PROD_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL
const PROD_KEY = process.env.SUPABASE_PROD_SERVICE_ROLE_KEY

// ════════ Validation ════════
const errors = []
if (!SKIP_DB && !PROD_DB_URL) errors.push('SUPABASE_PROD_DB_URL (or pass --skip-db)')
if (!SKIP_STORAGE) {
  if (!PROD_DB_URL) errors.push('SUPABASE_PROD_DB_URL is needed to fetch version_ids for storage dump')
  if (!PROD_URL) errors.push('SUPABASE_PROD_URL (or EXPO_PUBLIC_SUPABASE_URL)')
  if (!PROD_KEY) errors.push('SUPABASE_PROD_SERVICE_ROLE_KEY')
}
if (errors.length) {
  console.error('Missing env vars:')
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}
if ((PROD_URL ?? '').match(/127\.0\.0\.1|localhost/)) {
  console.error('Refusing: SUPABASE_PROD_URL points to localhost.')
  process.exit(1)
}
if ((PROD_DB_URL ?? '').match(/127\.0\.0\.1|localhost:54322/)) {
  console.error('Refusing: SUPABASE_PROD_DB_URL points to localhost.')
  process.exit(1)
}

await mkdir('backups', { recursive: true })

console.log(`Timestamp: ${TS}`)
console.log()

// ════════════ 1. DB dump ════════════
if (SKIP_DB) {
  console.log('Skipping DB dump (--skip-db)')
} else {
  const dumpFile = `backups/prod-db-${TS}.dump`
  console.log(`Dumping DB → ${dumpFile}`)
  const child = spawn(
    'pg_dump',
    [PROD_DB_URL, '-Fc', '--no-owner', '--no-privileges', '-f', dumpFile],
    { stdio: ['ignore', 'inherit', 'inherit'] },
  )
  const code = await new Promise((resolve) => child.on('exit', resolve))
  if (code !== 0) {
    console.error(`pg_dump exited ${code}`)
    process.exit(code ?? 1)
  }
  const { size } = await stat(dumpFile)
  console.log(`  done: ${(size / 1024 / 1024).toFixed(1)} MB`)
}
console.log()

// ════════════ 2. Storage dump ════════════
if (SKIP_STORAGE) {
  console.log('Skipping storage dump (--skip-storage)')
  process.exit(0)
}

const prod = createClient(PROD_URL, PROD_KEY, { auth: { persistSession: false } })

// Helper: pull (name, version) for a bucket via psql.
function listBucketObjects(bucketId) {
  const safe = bucketId.replace(/'/g, "''")
  const sql = `SELECT name, version FROM storage.objects WHERE bucket_id = '${safe}' ORDER BY name`
  const r = spawnSync('psql', [PROD_DB_URL, '-At', '-F\t', '-c', sql], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`psql failed for ${bucketId}: ${r.stderr}`)
  return r.stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [name, version] = line.split('\t')
      return { name, version }
    })
}

const { data: buckets, error: bErr } = await prod.storage.listBuckets()
if (bErr) throw new Error(`listBuckets: ${bErr.message}`)
const targetBuckets = BUCKET_FILTER
  ? buckets.filter((b) => BUCKET_FILTER.includes(b.id))
  : buckets

console.log(`Buckets to dump: ${targetBuckets.map((b) => b.id).join(', ')}`)
console.log()

const tmpRoot = await mkdtemp(join(tmpdir(), 'sb-prod-storage-'))
let totalFiles = 0
let totalBytes = 0

try {
  for (const bucket of targetBuckets) {
    console.log(`── ${bucket.id} ──`)
    const rows = listBucketObjects(bucket.id)
    console.log(`  ${rows.length} objects`)
    let count = 0
    let bytes = 0
    for (const { name, version } of rows) {
      if (!version) {
        console.warn(`  WARN ${name}: no version_id, skipping`)
        continue
      }
      const { data: blob, error: dlErr } = await prod.storage.from(bucket.id).download(name)
      if (dlErr) {
        console.warn(`  WARN ${name}: ${dlErr.message}`)
        continue
      }
      const buffer = Buffer.from(await blob.arrayBuffer())
      const filePath = join(tmpRoot, bucket.id, name, version)
      await mkdir(dirname(filePath), { recursive: true })
      await writeFile(filePath, buffer)
      count++
      bytes += buffer.length
      if (count % 10 === 0) {
        console.log(`  ${count}/${rows.length} (${(bytes / 1024 / 1024).toFixed(1)} MB)`)
      }
    }
    console.log(`  done: ${count}/${rows.length} (${(bytes / 1024 / 1024).toFixed(1)} MB)`)
    totalFiles += count
    totalBytes += bytes
  }

  // ── Tar.gz the temp dir into the final archive ──
  const archive = `backups/prod-storage-files-${TS}.tar.gz`
  console.log()
  console.log(`Creating archive ${archive}…`)
  const tar = spawnSync(
    'tar',
    ['-czf', archive, '-C', tmpRoot, '.'],
    { stdio: 'inherit' },
  )
  if (tar.status !== 0) {
    console.error(`tar exited ${tar.status}`)
    process.exit(tar.status ?? 1)
  }
  const { size } = await stat(archive)
  console.log(`  done: ${(size / 1024 / 1024).toFixed(1)} MB`)
} finally {
  await rm(tmpRoot, { recursive: true, force: true })
}

console.log()
console.log('=== Summary ===')
if (!SKIP_DB) console.log(`DB     : backups/prod-db-${TS}.dump`)
console.log(`Storage: backups/prod-storage-files-${TS}.tar.gz`)
console.log(`         ${totalFiles} files across ${targetBuckets.length} bucket(s), ${(totalBytes / 1024 / 1024).toFixed(1)} MB raw`)
console.log()
console.log('To browse the files in human-readable form:')
console.log(`  node scripts/extract-storage-files.mjs backups/prod-storage-files-${TS}.tar.gz`)
