# F1 Prediction Platform — Claude Code Guide

## Project Overview
F1 race winner prediction platform. Uses historical + current F1 data (via FastF1) to
predict race winners with a weighted feature scoring system. See PLAN.md for full architecture.

## Monorepo Layout
```
f1-intelligence/
├── web/           # Astro SSR on Cloudflare Pages
├── api/           # Hono on Cloudflare Workers (NestJS-style modules)
├── db/            # Drizzle ORM migrations (schema lives in api/src/db/schema/)
└── data-engine/   # Python ETL batch jobs on Render
```

---

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | Astro + Tailwind | `output: 'server'`, Cloudflare adapter |
| API | Hono | Cloudflare Workers |
| ORM | Drizzle ORM | TypeScript, schema lives in `api/src/db/schema/` |
| Database | Neon PostgreSQL | |
| DB driver (Workers) | `@neondatabase/serverless` | HTTP driver — mandatory for CF Workers |
| DB driver (Python) | `psycopg2` | TCP — fine on Render |
| Data source | FastF1 | Python library for F1 session data |
| Python runtime | Python 3.11+ | `data-engine/` |

---

## Critical Constraints — Read Before Writing Any Code

### 1. Cloudflare Workers cannot use TCP
Never use `pg`, `postgres`, or any npm package that uses TCP sockets in the `api/` directory.
Cloudflare Workers run in V8 isolates with no TCP support.

**Always use:**
```typescript
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
```

### 2. Drizzle schema is in `api/src/db/schema/`
The canonical schema lives in `api/src/db/schema/`. The `db/` folder holds only migration SQL files.
Never define schema inline in route files.

### 3. Astro data fetching is server-side only
All data fetching happens in Astro frontmatter (`---` blocks), never in `client:*` islands.
No React, Vue, or client-side JS for data fetching.

### 4. Python writes directly to Neon — never through the API
The Python ETL engine connects directly to Neon via psycopg2.
The Hono API is read-only from Neon's perspective.
Do not create write endpoints on the API for ETL use.

### 5. All ETL jobs must be idempotent
Every Python job uses `INSERT ... ON CONFLICT DO UPDATE`.
Running any job twice must produce identical results, never duplicate rows.

---

## Database

**Provider:** Neon PostgreSQL
**Connection:** `DATABASE_URL` environment variable (never hardcoded)

### Key Tables
- `circuits` — static track data, seeded once (includes `overtake_rate`)
- `seasons` — one row per year
- `races` — one per race event; `status` field controls ETL flow
- `teams` / `drivers` — season-scoped (change year to year)
- `qualifying_results` / `race_results` / `lap_times` — raw ingested data
- `driver_season_stats` / `team_season_stats` — aggregated after each race
- `driver_prediction_features` — 8 normalized feature scores per driver per race (ML anchor)
- `race_predictions` — one predicted winner per race

### Race Status Flow
```
'scheduled' → 'qualifying_done' → 'completed'
                     ↓                  ↓
             run predictions      ingest results
```

---

## API (Hono — `api/`)

### Module structure (NestJS-style)
```
api/src/
├── common/types.ts                    # Bindings + all response types
├── config/database.ts                 # createDb() — Neon HTTP driver
├── db/schema/                         # Drizzle table definitions
├── modules/
│   ├── races/{controller,service,module}.ts
│   ├── drivers/{controller,service,module}.ts
│   ├── teams/{controller,service,module}.ts
│   └── predictions/{controller,service,module}.ts
└── main.ts                            # Entry point, route registration
```

- **service** — DB queries (Drizzle, no Hono context)
- **controller** — parses Hono context, calls service, returns JSON
- **module** — Hono sub-router that wires controller handlers to routes

### Environment Variables
| Variable | Where set |
|----------|-----------|
| `DATABASE_URL` | `wrangler secret put DATABASE_URL` |

### Response format
All endpoints return:
```typescript
{ data: T, error: null }          // success
{ data: null, error: { code: string, message: string } }  // failure
```

### Route structure
```
GET /api/health
GET /api/races?year=N&status=S
GET /api/races/:id
GET /api/drivers?year=N
GET /api/drivers/:id?year=N
GET /api/teams?year=N
GET /api/teams/:id?year=N
GET /api/predictions/upcoming
GET /api/predictions/race/:race_id
```

No authentication. No write endpoints (ETL writes directly to DB).

### No N+1 queries
All queries use Drizzle joins. Never fetch a list then loop-query for each item.

---

## Frontend (Astro — `web/`)

### Environment Variables
| Variable | Where set |
|----------|-----------|
| `PUBLIC_API_URL` | Cloudflare Pages env vars |

### Pages
| Route | Layout | Data source |
|-------|--------|------------|
| `/` | LandingLayout | Static (no API) |
| `/prediction` | BaseLayout | `GET /api/predictions/upcoming` |
| `/races/[id]` | BaseLayout | `GET /api/races/:id` |
| `/drivers/[id]` | BaseLayout | `GET /api/drivers/:id` |
| `/teams/[id]` | BaseLayout | `GET /api/teams/:id` |

### Component rules
- No chart libraries — use plain SVG for `LapChart.astro`
- No heavy animation libraries
- Tailwind for all styling
- `.astro` components for display; `.tsx` for interactive Shadcn islands
- `client:load` only when interactivity is strictly needed (currently: none)

---

## Python Data Engine (`data-engine/`)

### Environment Variables
| Variable | Where set |
|----------|-----------|
| `DATABASE_URL` | Render dashboard env vars |

### Running jobs locally
```bash
cd data-engine
python src/main.py --job ingest_race --year 2025 --round 14
python src/main.py --job ingest_qualifying --year 2025 --round 14
python src/main.py --job compute_features --race_id 42
python src/main.py --job compute_predictions --race_id 42
python src/main.py --job compute_season_stats --year 2025
```

### Cron schedule (Render)
- **Saturday 22:00 UTC**: `ingest_qualifying` → `compute_features` → `compute_predictions`
- **Sunday 18:00 UTC**: `ingest_race` → `compute_season_stats`

### FastF1 usage
```python
import fastf1
session = fastf1.get_session(year, round_num, 'Q')  # or 'R', 'FP1', etc.
session.load(laps=True, telemetry=False, weather=True, messages=False)
```
Cache FastF1 responses locally during development: `fastf1.Cache.enable_cache('./cache')`.

### Error handling
Jobs exit with code 1 on failure (Render marks job failed for manual retrigger).
Never use `sleep()` inside jobs — Render has a job timeout.
Use structured logging: `{"job": "ingest_race", "round": 14, "status": "failed", "error": "..."}`.

---

## Drizzle ORM (`db/`)

### Running migrations
```bash
cd db
bun run drizzle-kit generate   # generate SQL from schema changes
bun run drizzle-kit push       # apply to Neon (dev)
bun run drizzle-kit migrate    # apply via migration files (prod)
```

### Schema conventions
- All tables use `SERIAL` primary keys
- All timestamps are `TIMESTAMPTZ` with `DEFAULT now()`
- Lap times stored as `INTEGER` milliseconds (never float)
- Feature scores stored as `NUMERIC(6,5)` (0.00000 to 1.00000)
- Unique constraints on all natural keys (e.g. `UNIQUE(race_id, driver_id)`)

---

## Prediction Model

### Weights
| Feature | Weight | Source |
|---------|--------|--------|
| Car Performance | 30% | `team_season_stats.car_performance_score` |
| Driver Rating | 15% | `driver_season_stats.total_points / races` |
| Starting Position | 15% | `qualifying_results.grid_position` |
| Win Rate | 15% | `driver_season_stats.win_rate` (Bayesian smoothed) |
| Luck Factor | 10% | Rolling 5-race position delta vs expectation |
| Weather Impact | 5% | Historical wet-race performance (neutral if dry) |
| Track Overtake Rate | 5% | `circuits.overtake_rate` (static) |
| Position Gain Rate | 5% | `driver_season_stats.avg_position_gain` |

### Softmax
Temperature T=0.3. Lower = more decisive. Do not increase T.
```python
exp_s = np.exp(scores / 0.3)
win_probabilities = exp_s / exp_s.sum()
```

---

## Development Setup

### API
```bash
cd api
bun install
bun run dev          # local dev via wrangler dev
bun run deploy       # deploy to CF Workers
```

### Frontend (web/)
```bash
cd web
bun install
bun run dev          # local Astro dev server on :4321
bun run build        # production build
```

### Data Engine
```bash
cd data-engine
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in DATABASE_URL
```

### Database
```bash
cd db
bun install
bun run drizzle-kit push   # apply schema to Neon
```

---

## Code Style

- TypeScript strict mode everywhere in `api/` and `frontend/`
- No `any` types — define proper interfaces in `types/index.ts`
- Python: type hints on all function signatures
- No comments explaining what code does — name things clearly instead
- Only comment WHY when it's non-obvious (a hidden constraint, a workaround)
- No console.log in production code — use structured logging patterns
