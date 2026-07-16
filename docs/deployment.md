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
| `DASHBOARD_PASSWORD` | Render → Service → Environment → Environment Variables |
| `DASHBOARD_USER` | Render → Service → Environment → Environment Variables (optional, defaults to `admin`) |

`DASHBOARD_PASSWORD` gates the live activity dashboard with HTTP Basic Auth. Without it set, the dashboard route returns 401 for everyone — the `HEAD` health-check endpoint used by UptimeRobot stays open regardless.

---

## CORS

The API allows requests only from `https://f1.gorkemkaryol.dev` in production. `http://localhost:4321` and `http://localhost:8787` are only allowed when the `ENVIRONMENT` var is not `"production"` — `wrangler.toml` sets `ENVIRONMENT = "production"` for the deployed Worker, and `.dev.vars` overrides it to `"development"` for local `wrangler dev`.

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
2. Add `DATABASE_URL` and `DASHBOARD_PASSWORD` as environment variables.
3. Configure as a **Web Service** (not a cron job) to utilize the free tier.
4. Set the Build Command: `pip install -r requirements.txt`
5. Set the Start Command: `python -m src.server`
6. **Important**: Since Render free tier web services spin down after 15 minutes of inactivity, set up an UptimeRobot HTTP monitor pointing to your Render URL (e.g. `https://f1-data-engine.onrender.com/`) to ping it every 5 minutes. This keeps the worker alive so it can check for new FastF1 data every hour automatically. The root URL only responds to `HEAD` for the uptime ping — navigating to it in a browser prompts for the `DASHBOARD_USER`/`DASHBOARD_PASSWORD` credentials before showing the live HTML dashboard of the engine's activities and logs.

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
