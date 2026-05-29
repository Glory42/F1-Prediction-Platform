# F1 Intelligence Platform — MVP Architecture & Roadmap

## Table of Contents
1. [System Architecture](#1-system-architecture)
2. [Folder Structure](#2-folder-structure)
3. [Database Schema](#3-database-schema)
4. [Data Pipeline](#4-data-pipeline)
5. [Feature Engineering](#5-feature-engineering)
6. [API Routes](#6-api-routes)
7. [Build Roadmap](#7-build-roadmap)
8. [Risks & Constraints](#8-risks--constraints)

---

## 1. System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  DATA LAYER (Batch ETL)                 │
│                                                         │
│  Render Cron Jobs                                       │
│  ┌────────────────────────────────────────┐             │
│  │  Python Engine                         │             │
│  │  FastF1 → Feature Calculator → Neon   │             │
│  │  (psycopg2, TCP — Render is a server) │             │
│  └────────────────────────────────────────┘             │
└─────────────────────────────────────────────────────────┘
                          │ SQL over HTTPS
                          ▼
┌─────────────────────────────────────────────────────────┐
│                     API LAYER                           │
│  Cloudflare Workers                                     │
│  Hono + Drizzle + @neondatabase/serverless              │
│  (HTTP driver — no TCP, CF Workers constraint)          │
└─────────────────────────────────────────────────────────┘
                          │ fetch() over HTTPS
                          ▼
┌─────────────────────────────────────────────────────────┐
│                  PRESENTATION LAYER                     │
│  Cloudflare Pages                                       │
│  Astro (output: 'server') — SSR, fetches API on req    │
└─────────────────────────────────────────────────────────┘
```

### Critical Constraint
Cloudflare Workers run in V8 isolates — no TCP. The Hono API must use
`@neondatabase/serverless` (HTTP driver). Never use `pg` or `postgres` npm packages
in the Worker context. The Python engine on Render uses `psycopg2` over TCP normally.

---

## 2. Folder Structure

### Root
```
f1-intelligence/
├── frontend/          # Astro on Cloudflare Pages
├── api/               # Hono on Cloudflare Workers
├── db/                # Drizzle schema + migrations (source of truth)
├── data-engine/       # Python ETL on Render
├── CLAUDE.md
├── PLAN.md
└── README.md
```

### `frontend/`
```
frontend/
├── src/
│   ├── layouts/
│   │   └── BaseLayout.astro
│   ├── pages/
│   │   ├── index.astro                  # Redirect → /prediction
│   │   ├── prediction.astro
│   │   ├── races/
│   │   │   └── [id].astro
│   │   ├── drivers/
│   │   │   └── [id].astro
│   │   └── teams/
│   │       └── [id].astro
│   ├── components/
│   │   ├── PredictionCard.astro
│   │   ├── ProbabilityBar.astro
│   │   ├── LapChart.astro               # Pure SVG, no chart library
│   │   ├── DriverStatsTable.astro
│   │   └── RaceResultsTable.astro
│   ├── lib/
│   │   └── api.ts                       # Typed fetch wrappers
│   └── types/
│       └── index.ts
├── public/
│   └── favicon.svg
├── astro.config.mjs                     # output:'server', CF adapter
├── wrangler.toml
├── tsconfig.json
└── package.json
```

### `api/`
```
api/
├── src/
│   ├── index.ts                         # Hono app entry, register routes
│   ├── db/
│   │   └── client.ts                    # neon() + drizzle() instance
│   ├── routes/
│   │   ├── races.ts
│   │   ├── drivers.ts
│   │   ├── teams.ts
│   │   └── predictions.ts
│   ├── services/
│   │   ├── raceService.ts
│   │   ├── driverService.ts
│   │   ├── teamService.ts
│   │   └── predictionService.ts
│   └── types/
│       └── index.ts
├── wrangler.toml
├── tsconfig.json
└── package.json
```

### `db/`
```
db/
├── schema/
│   ├── index.ts                         # Re-exports all tables
│   ├── circuits.ts
│   ├── seasons.ts
│   ├── races.ts
│   ├── drivers.ts
│   ├── teams.ts
│   ├── qualifying_results.ts
│   ├── race_results.ts
│   ├── lap_times.ts
│   ├── driver_season_stats.ts
│   ├── team_season_stats.ts
│   ├── race_predictions.ts
│   └── driver_prediction_features.ts   # ML-expansion anchor table
├── migrations/
├── drizzle.config.ts
└── seed.ts
```

### `data-engine/`
```
data-engine/
├── src/
│   ├── main.py                          # CLI: python main.py --job <name>
│   ├── config.py                        # Env vars, DB connection string
│   ├── db/
│   │   └── client.py                    # psycopg2 connection pool
│   ├── jobs/
│   │   ├── ingest_race.py               # Post-race: results + lap times
│   │   ├── ingest_qualifying.py         # Pre-race: qualifying grid
│   │   ├── compute_features.py          # All 8 feature scores
│   │   └── compute_predictions.py       # Softmax → race_predictions
│   └── utils/
│       ├── fastf1_helpers.py
│       ├── math_utils.py                # softmax, normalization
│       └── upsert.py                    # Generic upsert helper
├── tests/
│   └── test_features.py
├── render.yaml                          # Cron job definitions
├── requirements.txt
└── .env.example
```

---

## 3. Database Schema

### `seasons`
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| year | INTEGER UNIQUE | e.g. 2025 |
| created_at | TIMESTAMPTZ | DEFAULT now() |

### `circuits`
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| circuit_key | VARCHAR(50) UNIQUE | FastF1 key e.g. `'monza'` |
| name | VARCHAR(100) | `'Autodromo Nazionale Monza'` |
| country | VARCHAR(50) | |
| city | VARCHAR(50) | |
| lap_count | INTEGER | |
| track_length_km | NUMERIC(5,3) | |
| overtake_rate | NUMERIC(4,3) | 0.0–1.0, static per track, seeded once |
| created_at | TIMESTAMPTZ | DEFAULT now() |

`overtake_rate` is a static value loaded at seed time. Monza ≈ 0.85, Monaco ≈ 0.05.

### `races`
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| season_id | INTEGER FK → seasons | |
| circuit_id | INTEGER FK → circuits | |
| round_number | INTEGER | 1–24 |
| name | VARCHAR(100) | `'Italian Grand Prix'` |
| race_date | DATE | |
| status | VARCHAR(20) | `'scheduled'` \| `'qualifying_done'` \| `'completed'` |
| weather | VARCHAR(30) | `'dry'` \| `'wet'` \| `'mixed'`, set post-race |
| created_at | TIMESTAMPTZ | DEFAULT now() |
| | UNIQUE(season_id, round_number) | |

`status` is the ETL control valve — prediction only runs after `qualifying_done`.

### `teams`
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| season_id | INTEGER FK → seasons | Season-scoped (teams rename between years) |
| team_key | VARCHAR(50) | FastF1 key e.g. `'red_bull'` |
| name | VARCHAR(100) | `'Red Bull Racing'` |
| nationality | VARCHAR(50) | |
| created_at | TIMESTAMPTZ | |
| | UNIQUE(season_id, team_key) | |

### `drivers`
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| season_id | INTEGER FK → seasons | Season-scoped (drivers change teams) |
| team_id | INTEGER FK → teams | |
| driver_number | INTEGER | |
| code | CHAR(3) | `'VER'`, `'HAM'` |
| first_name | VARCHAR(50) | |
| last_name | VARCHAR(50) | |
| nationality | VARCHAR(50) | |
| created_at | TIMESTAMPTZ | |
| | UNIQUE(season_id, driver_number) | |

### `qualifying_results`
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| race_id | INTEGER FK → races | |
| driver_id | INTEGER FK → drivers | |
| q1_time_ms | INTEGER | NULL if didn't set time |
| q2_time_ms | INTEGER | NULL if eliminated Q1 |
| q3_time_ms | INTEGER | NULL if eliminated Q2 |
| grid_position | INTEGER | Final grid position 1–20 |
| created_at | TIMESTAMPTZ | |
| | UNIQUE(race_id, driver_id) | |

Lap times as integers (milliseconds) — no float precision issues, trivially sortable.

### `race_results`
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| race_id | INTEGER FK → races | |
| driver_id | INTEGER FK → drivers | |
| finish_position | INTEGER | NULL = DNF |
| grid_position | INTEGER | |
| points | NUMERIC(4,1) | |
| status | VARCHAR(30) | `'Finished'` \| `'Retired'` \| `'+1 Lap'` etc (FastF1 string) |
| total_race_time_ms | BIGINT | NULL for non-finishers |
| fastest_lap | BOOLEAN | DEFAULT false |
| created_at | TIMESTAMPTZ | |
| | UNIQUE(race_id, driver_id) | |

### `lap_times`
| Column | Type | Notes |
|--------|------|-------|
| id | BIGSERIAL PK | |
| race_id | INTEGER FK → races | |
| driver_id | INTEGER FK → drivers | |
| lap_number | INTEGER | |
| lap_time_ms | INTEGER | NULL for in/out laps, safety car laps |
| compound | VARCHAR(10) | `'SOFT'` \| `'MEDIUM'` \| `'HARD'` \| `'INTER'` \| `'WET'` |
| is_pit_lap | BOOLEAN | DEFAULT false |
| created_at | TIMESTAMPTZ | |
| | UNIQUE(race_id, driver_id, lap_number) | |
| | INDEX(race_id, driver_id) | Critical for per-driver lap queries |

~1,200 rows/race × 24 races × 5 seasons = ~144,000 rows total. Small. Do not pre-aggregate.

### `driver_season_stats`
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| season_id | INTEGER FK → seasons | |
| driver_id | INTEGER FK → drivers | |
| races_entered | INTEGER | DEFAULT 0 |
| races_finished | INTEGER | DEFAULT 0 |
| wins | INTEGER | DEFAULT 0 |
| podiums | INTEGER | DEFAULT 0 |
| poles | INTEGER | DEFAULT 0 |
| total_points | NUMERIC(6,1) | DEFAULT 0 |
| championship_position | INTEGER | |
| avg_finish_position | NUMERIC(4,2) | |
| win_rate | NUMERIC(5,4) | `wins / races_entered` |
| avg_position_gain | NUMERIC(4,2) | `avg(grid_pos - finish_pos)` |
| updated_at | TIMESTAMPTZ | |
| | UNIQUE(season_id, driver_id) | |

### `team_season_stats`
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| season_id | INTEGER FK → seasons | |
| team_id | INTEGER FK → teams | |
| races_completed | INTEGER | DEFAULT 0 |
| wins | INTEGER | DEFAULT 0 |
| podiums | INTEGER | DEFAULT 0 |
| total_points | NUMERIC(6,1) | DEFAULT 0 |
| championship_position | INTEGER | |
| avg_finish_position | NUMERIC(4,2) | |
| car_performance_score | NUMERIC(5,4) | 0.0–1.0, normalized relative to field |
| updated_at | TIMESTAMPTZ | |
| | UNIQUE(season_id, team_id) | |

### `race_predictions`
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| race_id | INTEGER FK → races UNIQUE | One prediction per race |
| predicted_winner_id | INTEGER FK → drivers | |
| computed_at | TIMESTAMPTZ | |
| model_version | VARCHAR(20) | DEFAULT `'weighted-v1'`; future: `'xgboost-v1'` |
| notes | TEXT | Optional debug notes |

### `driver_prediction_features` — ML anchor table
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| race_id | INTEGER FK → races | |
| driver_id | INTEGER FK → drivers | |
| car_performance_score | NUMERIC(6,5) | 0.0–1.0 |
| driver_rating_score | NUMERIC(6,5) | 0.0–1.0 |
| starting_position_score | NUMERIC(6,5) | 0.0–1.0 |
| win_rate_score | NUMERIC(6,5) | 0.0–1.0 |
| luck_factor_score | NUMERIC(6,5) | 0.0–1.0 |
| weather_impact_score | NUMERIC(6,5) | 0.0–1.0 |
| track_overtake_score | NUMERIC(6,5) | 0.0–1.0 |
| position_gain_score | NUMERIC(6,5) | 0.0–1.0 |
| raw_weighted_score | NUMERIC(8,6) | Weighted sum before softmax |
| win_probability | NUMERIC(6,5) | After softmax across all 20 drivers |
| predicted_position | INTEGER | Rank by win_probability |
| computed_at | TIMESTAMPTZ | |
| | UNIQUE(race_id, driver_id) | |

Storing normalized scores (not raw inputs) means this table is a training-ready ML dataset without re-running the pipeline.

---

## 4. Data Pipeline

### Pipeline A — Post-Race (Sunday 18:00 UTC cron)

```
Step 1: ingest_race.py --year 2025 --round 14
  FastF1.get_session(year, round, 'R').load()
  → upsert race_results      (20 rows)
  → upsert lap_times         (~1,200 rows)
  → UPDATE races SET status='completed', weather=<derived>

Step 2: compute_season_stats.py --year 2025
  → Aggregate race_results → driver_season_stats
  → Aggregate race_results → team_season_stats
  → Recompute car_performance_score for all teams (min-max normalize)
```

### Pipeline B — Pre-Race Prediction (Saturday 22:00 UTC cron)

```
Step 1: ingest_qualifying.py --year 2025 --round 14
  FastF1.get_session(year, round, 'Q').load()
  → upsert qualifying_results  (20 rows)
  → UPDATE races SET status='qualifying_done'

Step 2: compute_features.py --race_id <id>
  For each of 20 drivers:
    Load: driver_season_stats, team_season_stats,
          qualifying_results, circuits.overtake_rate
    Compute all 8 raw feature scores
  → upsert driver_prediction_features  (20 rows)

Step 3: compute_predictions.py --race_id <id>
  → Load all 20 driver_prediction_features rows
  → Apply softmax with temperature T=0.3
  → UPDATE win_probability + predicted_position on each row
  → Determine predicted_winner (highest probability)
  → upsert race_predictions  (1 row)
```

All jobs are fully idempotent via `INSERT ... ON CONFLICT DO UPDATE`.
Re-running a job twice produces identical results, never duplicates.

### Neon Connection: Python (Render)
```python
# psycopg2 over TCP — standard, Render is a normal server
DATABASE_URL = "postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require"
conn = psycopg2.connect(DATABASE_URL)
```

### Neon Connection: Hono (Cloudflare Workers)
```typescript
// @neondatabase/serverless — HTTP driver, no TCP
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

const sql = neon(env.DATABASE_URL);
const db = drizzle(sql, { schema });
```

---

## 5. Feature Engineering

All features normalized to 0.0–1.0. Final weighted score:

```
raw_score = (car_performance  × 0.30)
          + (driver_rating    × 0.15)
          + (starting_position× 0.15)
          + (win_rate         × 0.15)
          + (luck_factor      × 0.10)
          + (weather_impact   × 0.05)
          + (track_overtake   × 0.05)
          + (position_gain    × 0.05)
```

### Feature 1 — Car Performance (30%)
- Source: `team_season_stats.car_performance_score`
- Computation: `avg_finish = mean(both drivers' finish positions this season)`
- Invert: `inverted = (21 - avg_finish) / 20` → P1 avg = 1.0, P20 avg = 0.05
- Min-max normalize across all teams in the field
- Fallback (< 3 races completed): use prior year constructor standings, mapped linearly P1=1.0, P10=0.1

### Feature 2 — Driver Rating (15%)
- Source: `driver_season_stats`
- `points_per_race = total_points / races_entered`
- `score = points_per_race / 25.0` (25 = max possible per race, clamp to [0,1])

### Feature 3 — Starting Position (15%)
- Source: `qualifying_results.grid_position`
- `score = (21 - grid_position) / 20`
- Pole = 1.0, P20 = 0.05

### Feature 4 — Win Rate (15%)
- Source: `driver_season_stats.win_rate`
- Bayesian smoothing: `score = (wins + 0.5) / (races_entered + 2)`
- Prevents 1-win-from-1-race = 1.0 early in season. Prior ≈ 25% baseline.

### Feature 5 — Luck Factor (10%)
- `expected_position = mean(grid_position, car_rank_in_field_that_race)`
- `delta = expected_position - finish_position` (positive = beat expectations)
- Rolling average over **last 5 races**: `avg_luck_delta`
- Min-max normalize across all drivers in the field

### Feature 6 — Weather Impact (5%)
- If `weather = 'dry'`: all drivers score 0.5 (neutral, not a differentiator)
- If `weather = 'wet'` or `'mixed'`:
  - Compute `wet_avg_finish` from all historical wet races per driver
  - `wet_skill = (21 - wet_avg_finish) / 20`, normalize across field
  - Drivers with < 3 wet-race data points → field average

### Feature 7 — Track Overtake Rate (5%)
- Source: `circuits.overtake_rate` (static, seeded per circuit)
- Same score for all drivers in a given race (circuit-level signal)
- High overtake rate → grid position matters less (pace/car carries more weight)

### Feature 8 — Position Gain Rate (5%)
- Source: `driver_season_stats.avg_position_gain`
- `avg_gain = mean(grid_pos - finish_pos)` all season (positive = gained positions)
- Normalize: `score = (avg_gain + 15) / 30`, clamp to [0, 1]
- Default for no data: 0.5

### Softmax Conversion
```python
import numpy as np
scores = np.array([d.raw_weighted_score for d in all_20_drivers])
T = 0.3  # Temperature — lower = more decisive probabilities
exp_s = np.exp(scores / T)
win_probabilities = exp_s / exp_s.sum()
assert abs(win_probabilities.sum() - 1.0) < 1e-4
```

T=0.3 produces decisive probabilities. F1 is not uniform — the dominant car wins ~60–70% of races. Do not increase T.

---

## 6. API Routes

Base: `https://api.f1intelligence.workers.dev`

All responses envelope: `{ data: T, error: null }` | `{ data: null, error: { code, message } }`

### Health
```
GET /api/health
→ { status: 'ok', db: 'connected', timestamp: string }
```

### Races
```
GET /api/races?year=2025&status=completed
→ { data: Race[] }
   Race: { id, name, round_number, race_date, status, weather, circuit: { name, country } }

GET /api/races/:id
→ { data: {
     race: Race & { circuit: Circuit },
     results: RaceResult[],           // sorted by finish_position
     qualifying: QualifyingResult[],  // sorted by grid_position
     laps: LapSummary[]              // per-driver aggregate: fastest, avg, total laps
   }}
   Note: laps is an AGGREGATE — never return raw ~1,200 lap rows to frontend
```

### Drivers
```
GET /api/drivers?year=2025&team_id=1
→ { data: Driver[] }

GET /api/drivers/:id?year=2025
→ { data: {
     driver: Driver & { team: Team },
     season_stats: DriverSeasonStats,
     recent_results: RaceResult[]   // last 5 races, includes race.name
   }}
```

### Teams
```
GET /api/teams?year=2025
→ { data: Team[] }

GET /api/teams/:id?year=2025
→ { data: {
     team: Team,
     season_stats: TeamSeasonStats,
     drivers: Driver[],
     recent_results: TeamRaceResult[]  // last 5 races, both drivers aggregated
   }}
```

### Predictions
```
GET /api/predictions/upcoming
→ { data: {
     race: Race & { circuit: Circuit },
     predicted_winner: Driver,
     computed_at: string,
     model_version: string,
     drivers: DriverPrediction[]    // all 20, sorted by win_probability desc
   }}
   DriverPrediction: {
     driver: Driver,
     win_probability: number,       // 0.0–1.0
     predicted_position: number,
     features: {
       car_performance: number,
       driver_rating: number,
       starting_position: number,
       win_rate: number,
       luck_factor: number,
       weather_impact: number,
       track_overtake: number,
       position_gain: number
     }
   }

GET /api/predictions/race/:race_id
→ Same shape as /upcoming — for historical accuracy review
```

---

## 7. Build Roadmap

### Week 1 — Foundation
**Goal**: Data can flow from FastF1 into Neon, and Neon can be queried from a Worker.

- [ ] Create Neon project, configure connection string
- [ ] Write all Drizzle schema files under `db/schema/`
- [ ] Run `drizzle-kit generate` + `drizzle-kit push` to apply migrations
- [ ] Seed `circuits` with 2025 calendar + static `overtake_rate` values
- [ ] Seed `seasons`, `teams`, `drivers` for 2025
- [ ] Python: virtualenv, install FastF1/psycopg2, write `db/client.py`, test connection
- [ ] Python: write and manually test `ingest_race.py` for one 2025 completed race
- [ ] Python: write `ingest_qualifying.py`
- [ ] Hono: scaffold Workers project, implement `GET /api/health`, verify Neon HTTP connection

**Exit criteria**: Python writes a race to Neon; Worker reads it.

### Week 2 — Full ETL + Stats
**Goal**: ETL pipeline complete, season stats computed, all API routes return real data.

- [ ] Generalize ingestion jobs to accept `--year`, `--round` CLI args
- [ ] Write `compute_season_stats.py`: aggregate to `driver_season_stats` + `team_season_stats`
- [ ] Write `compute_features.py`: implement all 8 feature scores
- [ ] Write `compute_predictions.py`: softmax, write `race_predictions`
- [ ] Backfill all 2024 completed races
- [ ] Verify predictions manually (does Bahrain 2024 predict Verstappen? He won.)
- [ ] Implement all Hono API routes: races, drivers, teams, predictions

**Exit criteria**: All API routes return real data from 2024/2025 backfill.

### Week 3 — Astro Frontend
**Goal**: All 4 pages live on Cloudflare Pages with real data.

- [ ] Create Astro project with `@astrojs/cloudflare` adapter, `output: 'server'`
- [ ] Write `lib/api.ts` typed fetch wrappers for all routes
- [ ] Build `prediction.astro` — driver probability table with `ProbabilityBar.astro`
- [ ] Build `races/[id].astro` — results + qualifying + SVG lap chart
- [ ] Build `drivers/[id].astro` — season stats + recent results
- [ ] Build `teams/[id].astro` — constructor stats + driver cards
- [ ] Deploy API Worker via `wrangler deploy`
- [ ] Deploy frontend to Cloudflare Pages via git (connect repo in CF dashboard)

**Exit criteria**: All 4 pages render real data in production.

### Week 4 — Automation, Polish, Hardening
**Goal**: System runs unattended for a full race weekend.

- [ ] Write `render.yaml` with two cron jobs (Sat 22:00 + Sun 18:00 UTC)
- [ ] Auto-detect current round (query Neon for next unfinished race)
- [ ] Verify ETL idempotency (run any job twice, confirm row counts unchanged)
- [ ] Add Python error handling (try/except + structured logging)
- [ ] Add Hono error middleware
- [ ] Frontend: loading skeletons, error states, mobile layout
- [ ] Backfill 2024 full season + retroactive predictions, measure accuracy rate
- [ ] Write README with env vars, deploy steps, manual ETL trigger instructions

**Exit criteria**: System survives a full race weekend unattended.

---

## 8. Risks & Constraints

### Critical Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| FastF1 data lag (1–2h after race) | ETL runs before data is ready | Exit code 1 on empty results; manually retrigger. No sleep() in jobs. |
| Neon cold start (~800ms) | Slow first request after 5min idle | Health-check cron every 5min pings `/api/health` → keeps Neon warm |
| CF Workers 10ms CPU limit | Expensive computation in Worker | All numerical computation in Python only. Worker = read + serialize. |
| ETL status race condition | `qualifying_done` set before features computed | Update `status` at end of job, not beginning |

### Tradeoffs

**SSR vs. SSG** — SSG is faster but needs triggered rebuild after every ETL run. SSR is simpler and fast enough for MVP. Revisit only if Pages latency > 500ms.

**Storing normalized scores not raw inputs** — `driver_prediction_features` stores 0–1 normalized scores. Raw inputs exist in `qualifying_results` / `race_results`. The features table is a training-ready ML dataset, not an audit log.

### What NOT To Do

- **Never use `pg` or `postgres` npm in the Worker.** They use TCP and will fail in V8 isolates.
- **Never use Prisma in the Worker.** Prisma's query engine is a native binary incompatible with CF Workers.
- **Never use Astro `client:*` directives for data fetching.** Keep all fetches server-side in Astro frontmatter.
- **Never route ETL writes through the Hono API.** Python writes directly to Neon. The API is read-only.
- **Never store secrets in `wrangler.toml`.** Use `wrangler secret put DATABASE_URL` for Workers.
- **No pagination in Week 1.** 24 races, 20 drivers, 10 teams — all small. Add when needed.
- **No user auth in MVP.** Pure data/prediction product.
- **No Redis.** Pre-computed predictions in `race_predictions` are already the cache.
- **No real-time pipeline.** ETL runs once after qualifying. No value in recomputing per request.
