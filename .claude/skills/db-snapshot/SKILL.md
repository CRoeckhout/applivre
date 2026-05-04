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

## Common failure modes

- **`duplicate key` aborting a restore transaction** → the TRUNCATE in step 3 was incomplete. Check which schema, add to the truncate list, retry.
- **`relation does not exist` during restore** → migrations weren't applied (step 2 failed). Re-run `supabase db reset` and check migration output.
- **Circular FK still erroring** → `session_replication_role = replica` requires superuser; the local `postgres` role has it, but if the session was opened differently this fails. Make sure you're connecting as `postgres` (default).
- **A migration changes an existing column type/name** → data-only restore will fail. Tell the user this skill assumes additive migrations only; for breaking schema changes, take a full schema+data dump and restore that instead (skipping `db reset`).

## Output expectations

Report concisely after each major step:
- Dumps: filenames + sizes
- Reset: number of migrations applied (last line of `supabase db reset` output)
- Restore: per-schema row counts
- Verification: any unexpected zeros

Keep dumps in `backups/` (already gitignored). Don't auto-delete — they're cheap insurance if the user realises they wanted the pre-reset state back.
