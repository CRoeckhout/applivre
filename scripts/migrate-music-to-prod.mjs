#!/usr/bin/env node
/**
 * Migre les musiques (DB rows + storage files) du local vers la prod.
 *
 * Comportement :
 *  - Skip-if-exists strict : aucune modification ou suppression en prod.
 *  - Themes : insert si absent en prod (matching par `key`).
 *  - Tracks : insert si absent (matching par `storage_path`). Le `theme_id`
 *    est remappé sur l'id du theme correspondant en prod (par `key`) pour
 *    rester cohérent même si prod avait déjà des themes avec d'autres UUIDs.
 *  - Files : list le bucket prod une fois, upload uniquement les paths absents.
 *
 * Pré-requis :
 *  - Migration 0058_reading_music.sql appliquée en prod (le bucket doit exister).
 *  - Supabase local running (`npx supabase status` doit répondre).
 *
 * Usage :
 *  Récupère la service_role key locale :
 *    npx supabase status -o env | grep SERVICE_ROLE_KEY
 *  Récupère la service_role key prod :
 *    Dashboard → Project Settings → API → service_role
 *
 *  SUPABASE_LOCAL_SERVICE_ROLE_KEY=eyJ... \
 *  SUPABASE_PROD_URL=https://nthmjgfqghznxqgidgdp.supabase.co \
 *  SUPABASE_PROD_SERVICE_ROLE_KEY=eyJ... \
 *  node scripts/migrate-music-to-prod.mjs [--dry-run]
 *
 *  Ou plus court avec Node 20+ :
 *  node --env-file=.env.local scripts/migrate-music-to-prod.mjs --dry-run
 */

import { createClient } from '@supabase/supabase-js'
import { spawnSync } from 'node:child_process'

const BUCKET = 'music-theme-tracks'
const DRY_RUN = process.argv.includes('--dry-run')
// Fallback : si l'API storage local plante (ex: xattrs perdus après tar/untar),
// lire les fichiers directement depuis le volume Docker via `docker exec`.
const STORAGE_CONTAINER = process.env.SUPABASE_STORAGE_CONTAINER ?? 'supabase_storage_grimolia'

const LOCAL_URL = process.env.SUPABASE_LOCAL_URL ?? 'http://127.0.0.1:54321'
const LOCAL_KEY = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY
const PROD_URL =
  process.env.SUPABASE_PROD_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL
const PROD_KEY = process.env.SUPABASE_PROD_SERVICE_ROLE_KEY

if (!LOCAL_KEY || !PROD_URL || !PROD_KEY) {
  console.error(
    [
      'Missing env vars. Need:',
      '  SUPABASE_LOCAL_SERVICE_ROLE_KEY  (npx supabase status -o env | grep SERVICE_ROLE_KEY)',
      '  SUPABASE_PROD_URL                (or EXPO_PUBLIC_SUPABASE_URL from .env)',
      '  SUPABASE_PROD_SERVICE_ROLE_KEY   (Supabase dashboard → API → service_role)',
    ].join('\n'),
  )
  process.exit(1)
}

if (PROD_URL.includes('127.0.0.1') || PROD_URL.includes('localhost')) {
  console.error('Refusing to run: SUPABASE_PROD_URL points to localhost. Set it to the real prod URL.')
  process.exit(1)
}

const local = createClient(LOCAL_URL, LOCAL_KEY, { auth: { persistSession: false } })
const prod = createClient(PROD_URL, PROD_KEY, { auth: { persistSession: false } })

console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}`)
console.log(`Local: ${LOCAL_URL}`)
console.log(`Prod : ${PROD_URL}`)
console.log()

// ────────── 1. Read local rows ──────────
const { data: localThemes, error: e1 } = await local
  .from('music_themes')
  .select('*')
  .order('sort_order', { ascending: true })
if (e1) throw new Error(`read local themes: ${e1.message}`)

const { data: localTracks, error: e2 } = await local
  .from('music_theme_tracks')
  .select('*')
  .order('sort_order', { ascending: true })
if (e2) throw new Error(`read local tracks: ${e2.message}`)

console.log(`Local: ${localThemes.length} themes, ${localTracks.length} tracks`)

// ────────── 2. Snapshot prod state ──────────
const { data: prodThemesBefore, error: e3 } = await prod
  .from('music_themes')
  .select('id, key')
if (e3) throw new Error(`read prod themes: ${e3.message}`)
const prodThemeKeys = new Set(prodThemesBefore.map((t) => t.key))

const { data: prodTracksBefore, error: e4 } = await prod
  .from('music_theme_tracks')
  .select('storage_path')
if (e4) throw new Error(`read prod tracks: ${e4.message}`)
const prodTrackPaths = new Set(prodTracksBefore.map((t) => t.storage_path))

console.log(
  `Prod : ${prodThemesBefore.length} themes, ${prodTracksBefore.length} tracks already present`,
)

// ────────── 3. Themes : insert missing ──────────
let themesAdded = 0,
  themesSkipped = 0
for (const t of localThemes) {
  if (prodThemeKeys.has(t.key)) {
    themesSkipped++
    continue
  }
  if (DRY_RUN) {
    console.log(`  [DRY] would insert theme ${t.key}`)
    themesAdded++
    continue
  }
  const { error } = await prod.from('music_themes').insert({
    id: t.id,
    key: t.key,
    display_name: t.display_name,
    sort_order: t.sort_order,
    is_active: t.is_active,
    created_at: t.created_at,
  })
  if (error) {
    if (error.code === '23505') {
      themesSkipped++
    } else {
      throw new Error(`insert theme ${t.key}: ${error.message}`)
    }
  } else {
    themesAdded++
    console.log(`  theme [add] ${t.key}`)
  }
}

// ────────── 4. Build local theme_id → prod theme.id map (via key) ──────────
const { data: prodThemesAfter, error: e5 } = await prod
  .from('music_themes')
  .select('id, key')
if (e5) throw new Error(`re-read prod themes: ${e5.message}`)
const keyToProdThemeId = new Map(prodThemesAfter.map((t) => [t.key, t.id]))
const localThemeIdToKey = new Map(localThemes.map((t) => [t.id, t.key]))

// ────────── 5. List prod files (per folder = theme key) ──────────
const folders = new Set(localTracks.map((t) => t.storage_path.split('/')[0]))
const prodFilePaths = new Set()
for (const folder of folders) {
  const { data, error } = await prod.storage
    .from(BUCKET)
    .list(folder, { limit: 1000 })
  if (error && !/not found/i.test(error.message)) {
    throw new Error(`list prod folder ${folder}: ${error.message}`)
  }
  for (const obj of data ?? []) {
    prodFilePaths.add(`${folder}/${obj.name}`)
  }
}
console.log(`Prod : ${prodFilePaths.size} files already in bucket "${BUCKET}"`)
console.log()

// ────────── 6. Tracks : upload file if missing, insert row if missing ──────────
let filesUploaded = 0,
  filesSkipped = 0,
  rowsAdded = 0,
  rowsSkipped = 0,
  warnings = []
for (const tr of localTracks) {
  const path = tr.storage_path

  // a. file
  if (prodFilePaths.has(path)) {
    filesSkipped++
  } else {
    if (DRY_RUN) {
      console.log(`  [DRY] would upload ${path}`)
      filesUploaded++
    } else {
      // Try API first; fall back to direct filesystem read if xattrs are broken
      let buffer
      const { data: blob, error: dlErr } = await local.storage
        .from(BUCKET)
        .download(path)
      if (dlErr) {
        // Lookup version_id via psql (storage schema isn't exposed via PostgREST locally)
        const safe = path.replace(/'/g, "''")
        const q = spawnSync(
          'psql',
          ['postgresql://postgres:postgres@127.0.0.1:54322/postgres', '-At',
           '-c', `SELECT version FROM storage.objects WHERE bucket_id = '${BUCKET}' AND name = '${safe}'`],
          { encoding: 'utf8' },
        )
        const version = q.stdout?.trim()
        if (q.status !== 0 || !version) {
          warnings.push(`lookup version for ${path}: ${q.stderr?.trim() || 'no row'} (api: ${dlErr.message})`)
          continue
        }
        const physPath = `/mnt/stub/stub/${BUCKET}/${path}/${version}`
        const r = spawnSync('docker', ['exec', STORAGE_CONTAINER, 'cat', physPath], {
          maxBuffer: 1024 * 1024 * 1024, // 1 GB — covers large audio/video
        })
        if (r.status !== 0) {
          warnings.push(`docker exec cat ${physPath}: ${r.stderr?.toString() ?? 'failed'}`)
          continue
        }
        buffer = r.stdout
        console.log(`  (fallback docker exec for ${path})`)
      } else {
        buffer = Buffer.from(await blob.arrayBuffer())
      }
      const { error: upErr } = await prod.storage
        .from(BUCKET)
        .upload(path, buffer, {
          contentType: 'audio/mpeg',
          cacheControl: '3600',
          upsert: false,
        })
      if (upErr) {
        if (/Duplicate|already exists/i.test(upErr.message)) {
          filesSkipped++
        } else {
          throw new Error(`upload ${path}: ${upErr.message}`)
        }
      } else {
        filesUploaded++
        console.log(`  file  [add] ${path} (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`)
      }
    }
  }

  // b. row
  if (prodTrackPaths.has(path)) {
    rowsSkipped++
    continue
  }
  const localKey = localThemeIdToKey.get(tr.theme_id)
  const prodThemeId = localKey ? keyToProdThemeId.get(localKey) : undefined
  if (!prodThemeId) {
    warnings.push(`track ${tr.title}: no matching theme in prod (local key=${localKey})`)
    continue
  }
  if (DRY_RUN) {
    console.log(`  [DRY] would insert track ${tr.title}`)
    rowsAdded++
    continue
  }
  const { error: insErr } = await prod.from('music_theme_tracks').insert({
    id: tr.id,
    theme_id: prodThemeId,
    title: tr.title,
    storage_path: path,
    sort_order: tr.sort_order,
    is_active: tr.is_active,
    duration_ms: tr.duration_ms,
    created_at: tr.created_at,
  })
  if (insErr) {
    if (insErr.code === '23505') {
      rowsSkipped++
    } else {
      throw new Error(`insert track ${tr.title}: ${insErr.message}`)
    }
  } else {
    rowsAdded++
    console.log(`  track [add] ${tr.title}`)
  }
}

// ────────── 7. Summary ──────────
console.log()
console.log('=== Summary ===')
console.log(`Themes : ${themesAdded} added, ${themesSkipped} already in prod`)
console.log(`Files  : ${filesUploaded} uploaded, ${filesSkipped} already in prod`)
console.log(`Tracks : ${rowsAdded} inserted, ${rowsSkipped} already in prod`)
if (warnings.length) {
  console.log()
  console.log(`Warnings (${warnings.length}):`)
  for (const w of warnings) console.log(`  - ${w}`)
}
if (DRY_RUN) {
  console.log()
  console.log('DRY RUN — nothing was written. Re-run without --dry-run to apply.')
}
