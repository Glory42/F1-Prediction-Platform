# DB — Drizzle Migrations

This directory holds generated SQL migration files only. The Drizzle schema definitions live in `../api/src/db/schema/`.

## Applying Migrations

```bash
# Dev: push schema directly to Neon (skips migration files)
cd ../api
DATABASE_URL=<your-url> bunx drizzle-kit push

# Prod: apply via migration files
cd ../api
DATABASE_URL=<your-url> bunx drizzle-kit migrate
```

## Generating New Migrations

After changing any file in `api/src/db/schema/`:

```bash
cd ../api
DATABASE_URL=<your-url> bunx drizzle-kit generate
```

This writes a new SQL file into `db/migrations/`. Commit both the schema change and the migration file together.

## Directory Layout

```
migrations/
  0000_*.sql       # initial schema
  0001_*.sql       # subsequent changes
  meta/
    _journal.json  # migration history
    *.json         # per-migration snapshots
```

## Rules

- Never edit migration SQL files by hand
- Always commit migration files alongside the schema changes that generated them
- `*.sqlite` files are gitignored (local Drizzle introspection artifacts)
