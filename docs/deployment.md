---
title: "Deployment"
description: "Cloudflare Pages, Workers, Render cron jobs, and environment variables"
order: 6
---

# Deployment

## Overview

| Layer | Platform | How it deploys |
|-------|----------|----------------|
| `web/` | Cloudflare Pages | Push to `master` → GitHub integration auto-builds |
| `api/` | Cloudflare Workers | Push to `master` → GitHub integration auto-builds |
| `data-engine/` | Render | Cron jobs triggered on schedule |
| DB migrations | Neon | Manual — run locally via `drizzle-kit` |

**Never run `wrangler deploy` or `bun run deploy` from the CLI.** Push to GitHub and let Cloudflare pick it up automatically.

---

## Environment Variables

### API — Cloudflare Workers Dashboard

| Variable | How to set | Notes |
|----------|-----------|-------|
| `DATABASE_URL` | Workers → Settings → Variables and Secrets → **Secret** | Neon connection string |

`keep_vars = true` is set in `api/wrangler.toml` so deploys never erase dashboard-set variables.

Set this as a **Secret** (not plaintext) so it's encrypted at rest.

### Frontend — Cloudflare Pages Dashboard

| Variable | How to set | Notes |
|----------|-----------|-------|
| `PUBLIC_API_URL` | Pages → Settings → Environment Variables | Full Worker URL |

Example value: `https://f1-intelligence-api.gorkemkaryol.workers.dev`

`keep_vars = true` is set in `web/wrangler.toml`.

### Data Engine — Render Dashboard

| Variable | How to set |
|----------|-----------|
| `DATABASE_URL` | Render → Service → Environment → Environment Variables |

---

## CORS

The API allows requests only from:

- `https://f1.gorkemkaryol.dev` (production)
- `http://localhost:4321` (Astro dev)
- `http://localhost:8787` (Wrangler dev)

Configured in `api/src/main.ts`. Only `GET` and `OPTIONS` methods are allowed.

---

## First-Time Setup

### 1. Database

```bash
cd db
bun install
# Set DATABASE_URL in your shell or .env
bun run drizzle-kit push    # applies schema to Neon
```

Then seed circuits and seasons:

```bash
cd data-engine
source venv/bin/activate
python src/main.py --job sync_schedule --year 2025
python src/main.py --job sync_season   --year 2025 --round 1
```

### 2. API (Cloudflare Workers)

1. Connect the `api/` directory to a Cloudflare Worker via the GitHub integration in the Cloudflare dashboard.
2. In the Worker's dashboard, add `DATABASE_URL` as a Secret.
3. Push to `master` to trigger the first deploy.

### 3. Frontend (Cloudflare Pages)

1. Connect the `web/` directory to Cloudflare Pages via the GitHub integration.
2. Set build command: `bun run build`
3. Set output directory: `dist`
4. Add environment variable `PUBLIC_API_URL` pointing to your Worker URL.
5. Push to `master` to trigger the first deploy.

### 4. Data Engine (Render)

1. Create a new Render service from the `data-engine/` directory.
2. Add `DATABASE_URL` as an environment variable.
3. Configure cron jobs:
   - Command: `python src/auto_runner.py`
   - Schedule: `0 * * * *` (Every hour)
   
   The `auto_runner.py` script automatically queries the database and FastF1 to determine if any qualifying or race data is ready to be ingested, gracefully waiting an extra hour if F1 delays the API data.

---

## Production Domain

Frontend: `https://f1.gorkemkaryol.dev` (custom domain on Cloudflare Pages)

---

## Local Development

```bash
# API
cd api
bun install
bun run dev        # starts on http://localhost:8787

# Frontend
cd web
bun install
bun run dev        # starts on http://localhost:4321

# Data engine
cd data-engine
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # add DATABASE_URL
```
