# Data Pipeline

## Jobs

All jobs live in `data-engine/src/jobs/`. They are invoked via `src/main.py --job <name>`.

| Job | Purpose |
|-----|---------|
| `sync_schedule` | Populates the `races` table for a season from FastF1 |
| `sync_season` | Populates `teams` and `drivers` for a season from FastF1 |
| `ingest_qualifying` | Ingests qualifying session data (Q1/Q2/Q3, sector times) — 2018+ |
| `ingest_qualifying_legacy` | Ingests qualifying from Ergast — pre-2018 |
| `ingest_race` | Ingests race results and full lap timing — 2018+ |
| `ingest_race_legacy` | Ingests race results from Ergast (no lap data) — pre-2018 |
| `compute_season_stats` | Aggregates `driver_season_stats` and `team_season_stats` for a year |
| `compute_features` | Computes the 12 feature scores per driver for a race |
| `compute_predictions` | Runs softmax on feature scores, writes win probabilities and predicted positions |

---

## Job Chain

The correct order for a season matters — each step depends on the previous:

```
sync_schedule        races table must exist before ingest can find rounds
      ↓
sync_season          teams and drivers must exist before results can reference them
      ↓
ingest_qualifying    qualifying_results must exist before compute_features
      ↓
ingest_race          race_results and lap_times ingested
      ↓
compute_season_stats driver_season_stats and team_season_stats must be fresh
                     before compute_features reads them
      ↓
compute_features     produces driver_prediction_features (raw weighted scores)
      ↓
compute_predictions  reads raw scores, runs softmax, writes probabilities
```

`compute_season_stats` should be re-run after each race so that rolling stats
(win rate, DNF rate, avg position gain) are up to date before the next prediction.

---

## Cron Schedule (Render)

| Time (UTC) | Jobs |
|------------|------|
| Saturday 22:00 | `ingest_qualifying` → `compute_features` → `compute_predictions` |
| Sunday 18:00 | `ingest_race` → `compute_season_stats` |

Sunday's `compute_season_stats` prepares rolling stats for the next race week.

---

## Running Jobs Locally

```bash
cd data-engine
source venv/bin/activate

python src/main.py --job sync_schedule     --year 2025
python src/main.py --job sync_season       --year 2025 --round 1
python src/main.py --job ingest_qualifying --year 2025 --round 14
python src/main.py --job ingest_race       --year 2025 --round 14
python src/main.py --job compute_season_stats --year 2025
python src/main.py --job compute_features  --race_id 42
python src/main.py --job compute_predictions --race_id 42
```

For pre-2018:

```bash
python src/main.py --job ingest_qualifying_legacy --year 2015 --round 5
python src/main.py --job ingest_race_legacy       --year 2015 --round 5
```

---

## Historical Backfill

The `run_backfill.py` script runs the full chain for a range of years:

```bash
cd data-engine
python run_backfill.py 2018 2020   # backfill 2018, 2019, 2020
python run_backfill.py 2000 2017   # legacy backfill
```

The script uses `safe()` wrappers so a single failing round does not abort the
whole year. Failures are printed as `[WARN]` lines.

**Important:** `sync_season` must succeed before any ingest job runs for that year.
If drivers are missing from the DB, all result rows will be silently skipped and
the race will be marked completed with 0 results (now raises a hard error).

---

## FastF1 Cache

FastF1 caches API responses locally. Enable it in development to avoid re-fetching:

```python
import fastf1
fastf1.Cache.enable_cache('./cache')
```

The cache is already enabled via `src/config.py`. The `cache/` directory is gitignored.

---

## Idempotency

Every job uses `INSERT ... ON CONFLICT DO UPDATE`. Running any job twice produces
identical results — no duplicate rows. This makes retries safe.

---

## Error Handling

- Jobs exit with code 1 on failure so Render marks the job failed for manual retrigger.
- Never use `sleep()` inside jobs — Render has a job timeout.
- Use structured logging: `{"job": "ingest_race", "round": 14, "status": "failed", "error": "..."}`.
