# Contributing

## Prerequisites

- [Bun](https://bun.sh/) (API + frontend)
- Python 3.11+
- Access to the Neon database (`DATABASE_URL`)

## Local Setup

```bash
# API
cd api && bun install

# Frontend
cd web && bun install

# Data engine
cd data-engine
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in DATABASE_URL
```

## Before Pushing

**API** — type-check:
```bash
cd api && bunx tsc --noEmit
```

**Frontend** — build to catch TypeScript errors:
```bash
cd web && bun run build
```

**Python** — run any affected jobs locally against a real DB before pushing.

## Code Style

- TypeScript strict mode everywhere — no `any`
- Python type hints on all function signatures
- No comments explaining what code does — name things clearly
- Only comment WHY when it's non-obvious (a hidden constraint, a workaround)
- No `console.log` in production code

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/) with project scopes:

```
feat(prediction): ...
fix(web): ...
style(navbar): ...
data(etl): ...
chore(db): ...
```

Scopes: `web`, `api`, `db`, `etl`, `navbar`, `prediction`, `races`, `drivers`, `teams`, `ui`, `config`

## Critical Rules

- **Never use TCP drivers (`pg`, `postgres`) in `api/`** — Cloudflare Workers require `@neondatabase/serverless`
- **Never deploy via CLI** — push to GitHub; Cloudflare deploys automatically
- **Never write through the API from Python** — ETL writes directly to Neon
- **All ETL jobs must stay idempotent** — `INSERT ... ON CONFLICT DO UPDATE` always
- **All data fetching in Astro frontmatter** — never in `client:*` islands
- **Schema lives in `api/src/db/schema/`** — never inline in route files

## Project Docs

- [`CLAUDE.md`](CLAUDE.md) — full architecture reference and constraints
- [`CODEMAP.md`](CODEMAP.md) — full file-level reference map
- [`api/README.md`](api/README.md) — API setup and routes
- [`web/README.md`](web/README.md) — frontend setup and pages
- [`data-engine/README.md`](data-engine/README.md) — ETL jobs and cron schedule
- [`db/README.md`](db/README.md) — migration workflow
