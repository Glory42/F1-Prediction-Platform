# Data Engine — Python ETL on Render

Batch ETL jobs that ingest F1 data from FastF1/Ergast and compute race predictions. Runs on Render as cron jobs; writes directly to Neon PostgreSQL via psycopg2.

## Setup

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in DATABASE_URL
```

## Running Jobs

```bash
# Sync race schedule for a year
python -m src.main --job sync_schedule --year 2025

# Sync driver/team roster
python -m src.main --job sync_season --year 2025 --round 1

# Ingest qualifying (2018+: FastF1 full timing)
python -m src.main --job ingest_qualifying --year 2025 --round 14

# Ingest qualifying (pre-2018: Ergast results only)
python -m src.main --job ingest_qualifying_legacy --year 2010 --round 5

# Ingest race results
python -m src.main --job ingest_race --year 2025 --round 14
python -m src.main --job ingest_race_legacy --year 2010 --round 5

# Compute features for a race (run after qualifying is ingested)
python -m src.main --job compute_features --race_id 42

# Compute predictions (run after features)
python -m src.main --job compute_predictions --race_id 42

# Recompute season stats (run after race results are ingested)
python -m src.main --job compute_season_stats --year 2025
```

## Historical Backfill

```bash
# Full backfill for a year range (sync → ingest → compute)
python run_backfill.py 2000 2025

# Background with log
python run_backfill.py 2019 2023 > /tmp/backfill.log 2>&1 &
```

Data coverage:
- **2018–present**: FastF1 full timing (lap times, sector times, telemetry)
- **2000–2017**: Ergast results only (no lap times)

## Cron Schedule (Render)

| Time (UTC) | Jobs |
|------------|------|
| Saturday 22:00 | `ingest_qualifying` → `compute_features` → `compute_predictions` |
| Sunday 18:00 | `ingest_race` → `compute_season_stats` |

## FastF1 Cache

Enable during development to avoid re-downloading sessions:

```python
import fastf1
fastf1.Cache.enable_cache('./cache')
```

The `cache/` directory is gitignored.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Neon PostgreSQL connection string (psycopg2 TCP) |

## Rules

- All jobs are idempotent — safe to re-run (`INSERT ... ON CONFLICT DO UPDATE`)
- Jobs exit with code 1 on failure (Render marks the job failed for manual retrigger)
- No `sleep()` inside jobs — Render has a job timeout
- Structured logging: `{"job": "ingest_race", "round": 14, "status": "failed", "error": "..."}`
- Never write through the Hono API — connect directly to Neon
