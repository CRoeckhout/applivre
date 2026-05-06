#!/usr/bin/env node
/**
 * Extrait un tar.gz du volume Supabase Storage (produit par /db-snapshot --with-files)
 * et restitue les fichiers avec leurs noms logiques — extensions comprises —
 * pour pouvoir les inspecter ou les ré-utiliser hors-Supabase.
 *
 * Layout source (Supabase Storage) :
 *   <bucket>/<...>/<filename.ext>/<version-uuid>     ← fichier (UUID, sans extension)
 *
 * Layout produit :
 *   <bucket>/<...>/<filename.ext>                    ← fichier (avec extension)
 *
 * Si plusieurs UUIDs cohabitent dans un même dossier logique (Supabase versionne
 * sur upload), on garde celui dont le mtime est le plus récent. La version
 * "officielle" vit normalement dans storage.objects.version mais on ne la lit
 * pas ici — c'est une heuristique acceptable pour 99 % des cas.
 *
 * Usage :
 *   node scripts/extract-storage-files.mjs <tar.gz> [--out <dir>] [--bucket <name>]
 *
 *   Default --out : backups/extracted-<TS>/  (TS extrait du nom du tar)
 *   --bucket peut être passé plusieurs fois (ou en CSV : --bucket a,b,c)
 */

import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, copyFile, readdir, stat, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname, sep } from 'node:path'
import { tmpdir } from 'node:os'

const argv = process.argv.slice(2)
const tarFile = argv.find((a) => !a.startsWith('--'))
if (!tarFile) {
  console.error('Usage: extract-storage-files.mjs <tar.gz> [--out <dir>] [--bucket <name>]')
  process.exit(1)
}
if (!existsSync(tarFile)) {
  console.error(`Not found: ${tarFile}`)
  process.exit(1)
}

const outIdx = argv.indexOf('--out')
const ts = tarFile.match(/(\d{8}-\d{6})/)?.[1] ?? `${Date.now()}`
const outDir = outIdx >= 0 ? argv[outIdx + 1] : `backups/extracted-${ts}`

const bucketFilter = (() => {
  const list = []
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--bucket' && argv[i + 1]) list.push(...argv[i + 1].split(','))
  }
  return list.length ? new Set(list) : null
})()

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

console.log(`Source  : ${tarFile}`)
console.log(`Output  : ${outDir}`)
if (bucketFilter) console.log(`Buckets : ${[...bucketFilter].join(', ')}`)
console.log()

// 1. Extract tar.gz to a temp dir
const tmp = await mkdtemp(join(tmpdir(), 'sb-extract-'))
const tar = spawnSync('tar', ['-xzf', tarFile, '-C', tmp], { stdio: 'inherit' })
if (tar.status !== 0) {
  console.error('tar exited non-zero')
  await rm(tmp, { recursive: true, force: true })
  process.exit(tar.status ?? 1)
}

// 2. Walk: a directory whose immediate children include UUID-named files is a
//    "logical filename" directory; emit one file at the path of that directory.
let copied = 0
let multi = 0
const skippedBuckets = new Set()

async function walk(dir) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }

  const versions = []
  const subdirs = []
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isFile() && UUID_RE.test(e.name)) versions.push(full)
    else if (e.isDirectory()) subdirs.push(full)
  }

  if (versions.length > 0) {
    const rel = dir.slice(tmp.length + 1) // strip tmp prefix
    // Bucket = first path segment
    const bucket = rel.split(sep)[0]
    if (bucketFilter && !bucketFilter.has(bucket)) {
      skippedBuckets.add(bucket)
    } else {
      // Pick most-recent version
      let pick = versions[0]
      let pickMtime = (await stat(pick)).mtimeMs
      for (let i = 1; i < versions.length; i++) {
        const m = (await stat(versions[i])).mtimeMs
        if (m > pickMtime) { pickMtime = m; pick = versions[i] }
      }
      if (versions.length > 1) {
        multi++
        console.log(`  multi-version (${versions.length}) ${rel} → keeping latest mtime`)
      }
      const out = join(outDir, rel)
      await mkdir(dirname(out), { recursive: true })
      await copyFile(pick, out)
      copied++
    }
    return // don't descend further; the UUIDs are leaves
  }

  for (const sub of subdirs) await walk(sub)
}

await walk(tmp)
await rm(tmp, { recursive: true, force: true })

console.log()
console.log('=== Summary ===')
console.log(`Files extracted : ${copied}`)
if (multi) console.log(`Multi-version dirs : ${multi} (kept latest mtime each)`)
if (skippedBuckets.size) console.log(`Skipped buckets : ${[...skippedBuckets].join(', ')}`)
console.log(`Output directory : ${outDir}`)
