---
name: db-snapshot
description: Dump → reset → restore the local Supabase DB in one shot. Use when the user wants to test migrations on a clean DB without losing local data, or asks to "snapshot/reset/restore the local db", "dump local et remet les data", etc. Local-only — never touches prod.
allowed-tools: Bash(npx supabase :*), Bash(psql :*), Bash(mkdir :*), Bash(ls :*), Bash(date :*), Bash(cat :*), Bash(echo :*), Bash(grep :*), Read, TaskCreate, TaskUpdate, TaskList
---

# db-snapshot

Snapshot → reset → restore for the local Supabase DB. Lets you re-apply migrations on a clean schema while keeping your local data.

## When to use

- User wants to test pending migrations against a fresh DB.
- User asks to "reset local db and put data back", "dump et remet les data", etc.
- Before running `supabase db reset` if local data must survive.

**Never** invoke this against production. The skill only targets `127.0.0.1:54322` (local pooler).

## Pre-flight

1. Confirm Supabase is running locally:
   ```bash
   npx supabase status
   ```
   If stopped, ask user to run `npx supabase start` — do not start it yourself.

2. Verify `supabase/seed.sql` exists and skim it (Read tool) to know what gets seeded by `db reset`. Catalog tables (`badge_catalog`, `border_catalog`, `fond_catalog`, `sticker_catalog`, `avatar_frame_catalog`) are typically seeded by migrations themselves — restore will conflict on these unless we TRUNCATE first.

## Workflow

### 1. Dump (data-only, 3 schemas)

Use a timestamp suffix so we never overwrite existing dumps:

```bash
mkdir -p backups
TS=$(date +%Y%m%d-%H%M%S)
npx supabase db dump --local --data-only --schema auth    -f "backups/local-auth-$TS.sql"
npx supabase db dump --local --data-only --schema storage -f "backups/local-storage-$TS.sql"
npx supabase db dump --local --data-only --schema public  -f "backups/local-public-$TS.sql"
```

Expect a `pg_dump` warning about circular FKs (e.g. `social_comments.parent_id`). It's a hint, not an error — handled by `session_replication_role = replica` at restore.

#### Optional: `--with-files` to also tar the storage volume

If the user passes `--with-files` (or otherwise asks for "fichiers physiques", "binaires", "vraie sauvegarde complète"), add this dump step:

```bash
# busybox tar (default in the alpine container) does NOT support --xattrs.
# Without xattrs the restore loses user.supabase.{content-type,cache-control,etag}
# and Storage v3 returns 500 ENODATA on every GET. Install GNU tar first.
docker exec supabase_storage_grimolia sh -c \
  'command -v setfattr >/dev/null || apk add --no-cache attr; \
   /bin/tar --version 2>&1 | grep -q "GNU tar" || apk add --no-cache tar'

docker exec supabase_storage_grimolia \
  tar --xattrs --xattrs-include='user.supabase.*' \
      -cf - -C /mnt/stub/stub . \
  | gzip > "backups/local-storage-files-$TS.tar.gz"
```

When to recommend this:
- Disaster recovery (Docker volume could be wiped, machine reinstall)
- Sharing a complete snapshot with a collègue / second dev machine
- Before risky Docker operations (`supabase stop --no-backup`, `docker volume rm`)

When to skip (default):
- Just testing migrations — physical files survive `db reset` because the volume is untouched, so the cycle works without this step
- Disk-constrained — the tar can be hundreds of MB once buckets fill up

### 2. Reset

```bash
npx supabase db reset --local
```

Re-applies every migration in `supabase/migrations/` then runs `supabase/seed.sql`. May take 30-90s. Tail the output to verify all migrations apply cleanly.

### 3. Truncate (before restore)

The reset just seeded `auth.users`, `public.profiles`, and all catalog tables. Restoring data-only dumps on top will hit `duplicate key` and rollback. Empty the target tables first:

```bash
DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"

# All public tables
psql "$DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
    EXECUTE format('TRUNCATE TABLE public.%I CASCADE', r.tablename);
  END LOOP;
END $$;
SQL

# auth + storage (CASCADE handles dependent tables)
psql "$DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
TRUNCATE auth.users CASCADE;
TRUNCATE storage.objects CASCADE;
TRUNCATE storage.buckets CASCADE;
SQL
```

We don't truncate `auth.schema_migrations` / `storage.migrations` / other auth system tables — those are managed by the Supabase services and should not be touched.

### 4. Restore (in order: auth → storage → public)

Wrap each restore in a transaction with `SET session_replication_role = replica` so triggers and FK constraints don't fire during data load. This handles circular FKs and the `updated_at` triggers cleanly.

```bash
DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"

restore() {
  local file=$1
  ( echo "BEGIN;"
    echo "SET session_replication_role = replica;"
    cat "$file"
    echo "SET session_replication_role = DEFAULT;"
    echo "COMMIT;"
  ) | psql "$DB_URL" -v ON_ERROR_STOP=1
}

restore "backups/local-auth-$TS.sql"
restore "backups/local-storage-$TS.sql"
restore "backups/local-public-$TS.sql"
```

Order matters: `public` rows often FK into `auth.users`, so auth must come first.

If `--with-files` was used at dump time, also restore the storage volume contents (run anytime after `supabase start`, before or after the SQL restore — the `version_id` matching is preserved by the tar):

```bash
# Same constraint as the dump step: GNU tar required to restore xattrs.
docker exec supabase_storage_grimolia sh -c \
  'command -v setfattr >/dev/null || apk add --no-cache attr; \
   /bin/tar --version 2>&1 | grep -q "GNU tar" || apk add --no-cache tar'

gunzip -c "backups/local-storage-files-$TS.tar.gz" \
  | docker exec -i supabase_storage_grimolia \
      tar --xattrs --xattrs-include='user.supabase.*' -xf - -C /mnt/stub/stub
```

**Recovery if xattrs were lost** (e.g. older snapshot taken with busybox tar): all
storage GETs return 500 with `code: ENODATA`. Run `node scripts/regen-storage-xattrs.mjs`
to rebuild `user.supabase.{content-type,cache-control,etag}` from `storage.objects.metadata`.
No re-upload needed — the physical files are intact, only metadata sidecars need restoring.

### 5. Verify

Spot-check counts on the tables that matter:

```bash
psql "$DB_URL" -c "
SELECT 'auth.users' AS tbl, count(*) FROM auth.users
UNION ALL SELECT 'public.profiles',      count(*) FROM public.profiles
UNION ALL SELECT 'public.books',         count(*) FROM public.books
UNION ALL SELECT 'public.user_books',    count(*) FROM public.user_books
UNION ALL SELECT 'public.reading_sheets',count(*) FROM public.reading_sheets
UNION ALL SELECT 'storage.objects',      count(*) FROM storage.objects
ORDER BY tbl;"
```

Compare with what the user expects. If a table is unexpectedly empty, suspect a silent failure in step 4 — re-run restore for that schema and read the full psql output.

## Storage buckets with binary files (audio, images, …)

Buckets like `music-theme-tracks`, `avatars`, `book-covers` keep two pieces of state:

1. **DB rows** in `storage.buckets` and `storage.objects` (path, version, size, mimetype, owner) — these ARE in the storage dump.
2. **Physical files** at `/mnt/stub/stub/<bucket>/<storage_path>/<version_id>` inside the `supabase_storage_<project>` Docker volume — these are NOT in the dump.

`supabase db reset` only resets Postgres. The storage volume is untouched, so physical files survive the reset. After truncate + restore the DB rows come back, with `version_id` matching the existing files on disk → signed URLs work, downloads succeed. Verified end-to-end with 28/28 music tracks.

**Pre-reset integrity check** (run inside the `supabase_storage_*` container, busybox find — no `-printf`):

```bash
docker exec supabase_storage_grimolia sh -c 'find /mnt/stub/stub/<bucket-name> -type f' | wc -l
```

Compare with `SELECT count(*) FROM storage.objects WHERE bucket_id='<bucket-name>'` — should match.

**Post-restore integrity check** (verifies version IDs line up with files on disk):

```bash
DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
ok=0; missing=0
while IFS=$'\t' read -r name ver; do
  if docker exec supabase_storage_grimolia sh -c "test -f '/mnt/stub/stub/<bucket-name>/$name/$ver'"; then
    ok=$((ok+1)); else missing=$((missing+1)); echo "MISSING: $name v=$ver"
  fi
done < <(psql "$DB_URL" -At -F$'\t' -c "SELECT name, version FROM storage.objects WHERE bucket_id='<bucket-name>'")
echo "OK=$ok MISSING=$missing"
```

**Danger zones** — physical files can disappear and break this:
- `supabase stop --no-backup` → wipes ALL volumes including storage
- `docker volume rm supabase_storage_<project>` → same
- A failed/recreated container that lost its volume mount (recovery from a Docker disk-full or network corruption — see "Docker environment is broken" below)

If physical files are gone but DB rows have been restored, signed URLs return 404. **There is no recovery from the dump** — re-upload via the app/admin is the only path. Tell the user explicitly when this happens.

## Docker environment is broken

If `npx supabase status` shows the DB as exited but `docker inspect` says running (or vice versa), the CLI cache and Docker reality have diverged. Check:

1. **Disk space** — `df -h /` and `docker system df`. If host filesystem is < 1 GB free or build cache > 5 GB, Docker can't start containers (`no space left on device`). Fix order: `docker builder prune -af` (safe, big gain), then remove old project containers (`docker ps -a --filter "name=_<old-project-name>"` then `docker rm`).
2. **Zombie network endpoints** — error `endpoint with name X already exists in network`. Fix:
   ```bash
   docker network disconnect -f supabase_network_<project> <ghost-container>
   docker network rm supabase_network_<project>   # then supabase start recreates it
   ```
   Volumes (i.e. data) are preserved across this — only the network and stopped containers go away.
3. **Stale containers from a renamed project** — if `config.toml` `project_id` was changed, old `supabase_*_<old-name>` containers linger. Safe to `docker rm -f` them, the volumes are independent.

## Common failure modes

- **`duplicate key` aborting a restore transaction** → the TRUNCATE in step 3 was incomplete. Check which schema, add to the truncate list, retry.
- **`relation does not exist` during restore** → migrations weren't applied (step 2 failed). Re-run `supabase db reset` and check migration output.
- **Circular FK still erroring** → `session_replication_role = replica` requires superuser; the local `postgres` role has it, but if the session was opened differently this fails. Make sure you're connecting as `postgres` (default).
- **A migration changes an existing column type/name** → data-only restore will fail. Tell the user this skill assumes additive migrations only; for breaking schema changes, take a full schema+data dump and restore that instead (skipping `db reset`).
- **Storage 404 on a path that's in `storage.objects`** → physical file missing from the volume (see "Storage buckets with binary files" above). Cross-check `name` + `version` against `/mnt/stub/stub/<bucket>/...` to confirm.
- **Storage 500 with `code: ENODATA` on every GET** → xattrs `user.supabase.*` were stripped (older snapshot taken/restored with busybox tar, or untar across a filesystem that doesn't preserve them). Run `node scripts/regen-storage-xattrs.mjs` to rebuild them from `storage.objects.metadata`. Physical files are fine — no re-upload needed.

## Output expectations

Report concisely after each major step:
- Dumps: filenames + sizes
- Reset: number of migrations applied (last line of `supabase db reset` output)
- Restore: per-schema row counts
- Verification: any unexpected zeros

Keep dumps in `backups/` (already gitignored). Don't auto-delete — they're cheap insurance if the user realises they wanted the pre-reset state back.
