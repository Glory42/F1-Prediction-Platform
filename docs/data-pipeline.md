# Data Pipeline

## Jobs

All jobs live in `data-engine/src/jobs/`. They are invoked via `src/main.py --job <name>`.

### Main Race Jobs

| Job | Purpose |
|-----|---------|
| `sync_schedule` | Populates the `races` table for a season from FastF1 (includes sprint dates, event_format) |
| `sync_season` | Populates `teams` and `drivers` for a season from FastF1 |
| `ingest_qualifying` | Ingests Q1/Q2/Q3 qualifying session data and sector times — 2018+ |
| `ingest_qualifying_legacy` | Ingests qualifying from Ergast — pre-2018 |
| `ingest_race` | Ingests race results, lap times, and race conditions (weather, SC/VSC, temps) — 2018+ |
| `ingest_race_legacy` | Ingests race results from Ergast (no lap data) — pre-2018 |
| `compute_season_stats` | Aggregates `driver_season_stats` and `team_season_stats` for a year (includes sprint aggregates) |
| `compute_features` | Computes the 12 feature scores per driver for a grand prix |
| `compute_predictions` | Runs softmax on feature scores, writes win probabilities and predicted positions |

### Sprint Race Jobs

| Job | Purpose |
|-----|---------|
| `ingest_sprint_qualifying` | Ingests SQ session — stores SQ1/SQ2/SQ3 times + sector times + speed in `sprint_results`; uses `messages=True`; has date guard |
| `ingest_sprint` | Ingests sprint race results, sprint lap times, and sprint conditions (weather, SC/VSC, temps) |
| `compute_sprint_features` | Computes 8 sprint-specific feature scores per driver |
| `compute_sprint_predictions` | Runs softmax on sprint feature scores → sprint win probabilities |

---

## Job Chain

### Conventional Weekend

```
sync_schedule        races table must exist before ingest can find rounds
      ↓
sync_season          teams and drivers must exist before results can reference them
      ↓
ingest_qualifying    qualifying_results must exist before compute_features
      ↓
ingest_race          race_results and lap_times ingested; race.status → completed
      ↓
compute_season_stats driver_season_stats and team_season_stats must be fresh
                     before compute_features reads them
      ↓
compute_features     produces driver_prediction_features (raw weighted scores)
      ↓
compute_predictions  reads raw scores, runs softmax, writes probabilities
```

### Sprint Weekend

```
sync_schedule + sync_season
      ↓
ingest_sprint_qualifying   → sprint_results (sq1/sq2/sq3 times + grid)
                             race.status → sprint_qualifying_done
      ↓
compute_sprint_features    → driver_sprint_features
compute_sprint_predictions → sprint_predictions
      ↓
ingest_sprint              → sprint_results (finish positions, points)
                             → sprint_lap_times, races (sprint conditions)
                             race.status → sprint_done
      ↓
compute_season_stats       → updates sprint_wins, sprint_total_points, etc.
      ↓
ingest_qualifying          → qualifying_results
                             race.status → qualifying_done
      ↓
compute_features + compute_predictions  → main race prediction
      ↓
ingest_race                → race_results + lap_times
                             race.status → completed
      ↓
compute_season_stats       → final season stats update
```

`compute_season_stats` should be re-run after each race so that rolling stats
(win rate, DNF rate, avg position gain, sprint aggregates) are up to date before the next prediction.

---

## Cron Schedule (Render)

### Conventional Weekend

| Time (UTC) | Jobs |
|------------|------|
| Saturday 22:00 | `ingest_qualifying` → `compute_features` → `compute_predictions` |
| Sunday 18:00 | `ingest_race` → `compute_season_stats` |

### Sprint Weekend

| Time (UTC) | Jobs |
|------------|------|
| Friday 22:00 | `ingest_sprint_qualifying` → `compute_sprint_features` → `compute_sprint_predictions` |
| Saturday 16:00 | `ingest_sprint` → `compute_season_stats` |
| Saturday 22:00 | `ingest_qualifying` → `compute_features` → `compute_predictions` |
| Sunday 18:00 | `ingest_race` → `compute_season_stats` |

---

## Running Jobs Locally

```bash
cd data-engine
source venv/bin/activate

# Sync
python src/main.py --job sync_schedule     --year 2026
python src/main.py --job sync_season       --year 2026 --round 1

# Main race pipeline
python src/main.py --job ingest_qualifying --year 2026 --round 6
python src/main.py --job ingest_race       --year 2026 --round 6
python src/main.py --job compute_season_stats --year 2026
python src/main.py --job compute_features  --race_id 42
python src/main.py --job compute_predictions --race_id 42

# Sprint pipeline
python src/main.py --job ingest_sprint_qualifying --year 2026 --round 9
python src/main.py --job compute_sprint_features  --race_id 55
python src/main.py --job compute_sprint_predictions --race_id 55
python src/main.py --job ingest_sprint            --year 2026 --round 9
```

For pre-2018:

```bash
python src/main.py --job ingest_qualifying_legacy --year 2015 --round 5
python src/main.py --job ingest_race_legacy       --year 2015 --round 5
```

---

## Historical Backfill

Two backfill scripts in `data-engine/`:

### Full backfill (`backfill_full.py`)

Runs the complete pipeline (sync → ingest → sprint pipeline → season stats → features → predictions) for every round in a year range. Sprint weekends are automatically detected and handled.

```bash
cd data-engine
source venv/bin/activate

python backfill_full.py                        # 2000–2026 (legacy years skip gracefully)
python backfill_full.py --start 2018           # 2018–2026 (recommended — full FastF1 coverage)
python backfill_full.py --start 2025 --end 2025
```

### Sprint-only backfill (`backfill_sprint.py`)

Re-runs just the sprint pipeline for specific years (useful after sprint schema changes).

```bash
python backfill_sprint.py --years 2021 2022 2024 2026
python backfill_sprint.py --years 2026          # single year
```

**Data coverage by era:**

| Years | Qualifying | Lap times | Sprint |
|-------|-----------|-----------|--------|
| 2018–present | Full Q1/Q2/Q3 + sector times | Full per-lap | Full SQ + sprint lap times |
| 2006–2017 | Q1/Q2/Q3 times | None | None (sprint format started 2021) |
| 2000–2005 | Single best lap only | None | None |

**Sprint format years:** 2021 (3 rounds), 2022 (3 rounds), 2023 (6 rounds), 2024 (6 rounds), 2025 (6 rounds), 2026+.

Both scripts use `_run()` wrappers — a single failing round does not abort the whole year. Failures print as `[SKIP]` lines.

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

The sprint qualifying ingest uses `exclude_update` to prevent SQ data from overwriting
already-ingested sprint race finish positions (`finish_position`, `points`, `status`,
`total_sprint_time_ms`, `fastest_lap` are never overwritten by SQ ingest).

`ingest_qualifying` and `ingest_sprint_qualifying` both have a **date guard**: they check
`qualifying_date`/`sprint_qualifying_date <= today` before loading FastF1, and raise an
error if no results came back. This prevents future rounds from being incorrectly set to
`qualifying_done`/`sprint_qualifying_done` by a backfill run.

---

## Error Handling

- Jobs exit with code 1 on failure so Render marks the job failed for manual retrigger.
- Never use `sleep()` inside jobs — Render has a job timeout.
- Use structured logging: `{"job": "ingest_race", "round": 14, "status": "failed", "error": "..."}`.
