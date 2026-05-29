# F1 Prediction Platform

F1 race winner prediction using historical and current data via FastF1. A weighted 8-feature scoring model with softmax outputs win probabilities for all 20 drivers before each race.

## Stack

| Layer | Technology | Host |
|-------|-----------|------|
| Frontend | Astro SSR + Tailwind | Cloudflare Pages |
| API | Hono + Drizzle ORM | Cloudflare Workers |
| Database | Neon PostgreSQL | Neon |
| Data Engine | Python + FastF1 | Render |

## Monorepo Layout

```
f1-prediction/
├── web/           # Astro SSR (output: 'server', Cloudflare adapter)
├── api/           # Hono on Cloudflare Workers (NestJS-style modules)
│   └── src/
│       ├── db/schema/   # Drizzle table definitions
│       └── modules/     # races, drivers, teams, predictions, seasons
├── db/            # Drizzle migrations only
└── data-engine/   # Python ETL batch jobs on Render
    └── src/
        └── jobs/  # ingest_race, ingest_qualifying, compute_features, compute_predictions
```

## Local Development

### API (Hono — Cloudflare Workers)
```bash
cd api
bun install
bun run dev        # wrangler dev on :8787
```

### Frontend (Astro)
```bash
cd web
bun install
bun run dev        # Astro dev server on :4321
```

### Data Engine (Python)
```bash
cd data-engine
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in DATABASE_URL
```

### Database (Drizzle)
```bash
cd api
bunx drizzle-kit push   # apply schema to Neon
```

## ETL Jobs

```bash
cd data-engine
python src/main.py --job ingest_qualifying --year 2025 --round 14
python src/main.py --job compute_features --race_id 42
python src/main.py --job compute_predictions --race_id 42
python src/main.py --job ingest_race --year 2025 --round 14
python src/main.py --job compute_season_stats --year 2025
```

Historical backfill (2018+ FastF1, pre-2018 Ergast):
```bash
cd data-engine
python run_backfill.py 2000 2025
```

## Environment Variables

| Variable | Service | How to set |
|----------|---------|-----------|
| `DATABASE_URL` | API (Worker) | `wrangler secret put DATABASE_URL` |
| `DATABASE_URL` | Data Engine | Render dashboard env vars |
| `PUBLIC_API_URL` | Frontend | Cloudflare Pages env vars |

## Prediction Model

8 features, softmax with temperature T=0.3:

| Feature | Weight |
|---------|--------|
| Car Performance | 30% |
| Driver Rating | 15% |
| Starting Position | 15% |
| Win Rate | 15% |
| Luck Factor | 10% |
| Weather Impact | 5% |
| Track Overtake Rate | 5% |
| Position Gain Rate | 5% |

## Deployment

- **API**: push to GitHub → Cloudflare Workers auto-deploys
- **Frontend**: push to GitHub → Cloudflare Pages auto-deploys
- **Data Engine**: Render cron jobs (Sat 22:00 UTC qualifying, Sun 18:00 UTC race)
