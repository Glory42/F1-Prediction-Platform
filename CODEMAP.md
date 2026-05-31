# F1 Prediction — Code Map

Complete directory structure and file reference for the codebase.

## Project Structure

```
F1-prediction/
├── CLAUDE.md              # Agent guidelines, constraints, and project conventions
├── CODEMAP.md             # This file — codebase structure reference
├── CONTRIBUTING.md        # Contribution guidelines
├── DECISIONS.md           # Key architectural decisions and rationale
├── README.md              # Project overview and getting started
├── LICENSE                # GPL-3.0
├── docs/                  # Project documentation
│   ├── architecture.md    # System diagram and layer connections
│   ├── prediction-model.md# Feature weights, scoring formula, softmax
│   ├── data-pipeline.md   # ETL job chain, cron schedule, backfill
│   ├── database-schema.md # All tables, columns, and relationships
│   ├── api-reference.md   # All endpoints, params, and response shapes
│   └── deployment.md      # Env vars, Cloudflare setup, first-time steps
├── api/                   # Hono REST API — Cloudflare Workers
├── web/                   # Astro SSR frontend — Cloudflare Pages
├── db/                    # Drizzle migration SQL files only
├── data-engine/           # Python ETL batch jobs — Render
└── .claude/skills/        # Claude Code skill definitions
    ├── commit/            # Conventional commit format and workflow
    ├── build/             # Build verification skill
    └── backfill/          # Historical backfill runbook
```

---

## API (`api/`)

Hono on Cloudflare Workers. NestJS-style module structure.
Must use `@neondatabase/serverless` (HTTP driver) — no TCP in Workers.

```
api/
├── src/
│   ├── main.ts                    # Entry point — registers CORS, logger, modules
│   ├── common/types.ts            # Bindings + all response types
│   ├── config/database.ts         # createDb() — Drizzle over Neon HTTP driver
│   ├── db/
│   │   ├── schema/                # Drizzle table definitions (source of truth)
│   │   │   ├── index.ts           # Re-exports all schemas
│   │   │   ├── seasons.ts
│   │   │   ├── circuits.ts
│   │   │   ├── teams.ts
│   │   │   ├── drivers.ts
│   │   │   ├── races.ts
│   │   │   ├── qualifying_results.ts
│   │   │   ├── race_results.ts
│   │   │   ├── lap_times.ts
│   │   │   ├── driver_season_stats.ts
│   │   │   ├── team_season_stats.ts
│   │   │   ├── race_predictions.ts
│   │   │   └── driver_prediction_features.ts
│   │   └── seed.ts                # DB seed helpers
│   └── modules/                   # Feature modules (service / controller / module)
│       ├── races/
│       │   ├── races.service.ts   # DB queries — race list, detail, circuit history
│       │   ├── races.controller.ts# Parses context, calls service, returns JSON
│       │   └── races.module.ts    # Hono sub-router: GET /, /:id, /circuit/:key
│       ├── drivers/
│       │   ├── drivers.service.ts # Driver list, standings, detail, career stats
│       │   ├── drivers.controller.ts
│       │   └── drivers.module.ts  # GET /, /standings, /:id, /:id/career
│       ├── teams/
│       │   ├── teams.service.ts   # Team list, standings, detail, career stats
│       │   ├── teams.controller.ts
│       │   └── teams.module.ts    # GET /, /standings, /:id, /:id/career
│       ├── predictions/
│       │   ├── predictions.service.ts # Upcoming, by race, history, intel standings
│       │   ├── predictions.controller.ts
│       │   └── predictions.module.ts  # GET /upcoming, /race/:id, /history, /standings
│       └── seasons/
│           ├── seasons.service.ts # Season list
│           ├── seasons.controller.ts
│           └── seasons.module.ts  # GET /
├── wrangler.toml                  # CF Workers config — keep_vars = true
├── drizzle.config.ts              # Points to api/src/db/schema
├── tsconfig.json
└── package.json
```

### Module Pattern

Each module follows the same three-file pattern:

| File | Responsibility |
|------|---------------|
| `*.service.ts` | Drizzle queries, no Hono context, returns typed data |
| `*.controller.ts` | Reads `c.req.query`/`c.req.param`, calls service, returns `c.json()` |
| `*.module.ts` | Creates Hono sub-router, wires routes to controller handlers |

### Routes

| Method | Path | Query params |
|--------|------|-------------|
| GET | `/api/health` | — |
| GET | `/api/seasons` | — |
| GET | `/api/races` | `year`, `status` |
| GET | `/api/races/:id` | — |
| GET | `/api/races/circuit/:circuitKey` | — |
| GET | `/api/drivers` | `year`, `team_id` |
| GET | `/api/drivers/standings` | `year` |
| GET | `/api/drivers/:id` | `year` |
| GET | `/api/drivers/:id/career` | — |
| GET | `/api/teams` | `year` |
| GET | `/api/teams/standings` | `year` |
| GET | `/api/teams/:id` | `year` |
| GET | `/api/teams/:id/career` | — |
| GET | `/api/predictions/upcoming` | — |
| GET | `/api/predictions/race/:raceId` | — |
| GET | `/api/predictions/history` | `year` |
| GET | `/api/predictions/standings` | `year` |

---

## Frontend (`web/`)

Astro SSR with Cloudflare adapter. All data fetching is server-side in Astro frontmatter — no client-side data fetching.

```
web/
├── src/
│   ├── pages/                     # File-based routes
│   │   ├── index.astro            # Landing page (static)
│   │   ├── prediction.astro       # Upcoming race prediction
│   │   ├── prediction/[id].astro  # Historical prediction by race
│   │   ├── races/
│   │   │   ├── index.astro        # Race calendar list
│   │   │   └── [id].astro         # Race detail — results, qualifying, lap chart
│   │   ├── drivers/
│   │   │   ├── index.astro        # Driver standings table
│   │   │   └── [id].astro         # Driver profile — stats, recent results
│   │   └── teams/
│   │       ├── index.astro        # Team standings table
│   │       └── [id].astro         # Team profile — stats, driver roster
│   ├── layouts/
│   │   ├── BaseLayout.astro       # Shared layout — Navbar, slot, global styles
│   │   └── LandingLayout.astro    # Landing-specific layout (no navbar chrome)
│   ├── components/
│   │   ├── Navbar.astro           # Top navigation bar
│   │   ├── YearSelect.astro       # Year selector (form-based, SSR navigation)
│   │   ├── YearSelectLinks.astro  # Year selector using anchor links
│   │   ├── LapChart.astro         # Plain SVG lap time chart (no chart library)
│   │   ├── ProbabilityBar.astro   # Inline win probability bar
│   │   ├── PredictionTable.tsx    # Driver prediction table with feature breakdown
│   │   ├── RaceResultsTable.tsx   # Race results with team color dots
│   │   ├── RecentResultsTable.tsx # Compact recent results table
│   │   ├── QualifyingGrid.tsx     # Qualifying session grid
│   │   ├── DriverStatsGrid.tsx    # Driver season stats card grid
│   │   ├── TeamStatsCard.tsx      # Team season stats card
│   │   └── ui/                    # Shadcn/ui primitives
│   │       ├── badge.tsx
│   │       ├── button.tsx
│   │       ├── card.tsx
│   │       └── table.tsx
│   ├── lib/
│   │   ├── api.ts                 # Typed API client — all fetch calls, uses PUBLIC_API_URL
│   │   ├── teamColors.ts          # team_key → official hex color map (fallback #6B7280)
│   │   └── utils.ts               # cn() helper (clsx + tailwind-merge)
│   ├── types/
│   │   └── index.ts               # All TypeScript types — Circuit, Team, Driver, Race,
│   │                              #   RaceResult, QualifyingResult, LapSummary,
│   │                              #   DriverSeasonStats, TeamSeasonStats, FeatureScores,
│   │                              #   DriverPrediction, PredictionResponse, RaceDetailResponse,
│   │                              #   DriverDetailResponse, TeamDetailResponse,
│   │                              #   DriverStanding, TeamStanding, PredictionHistoryItem,
│   │                              #   IntelStandingRow, CircuitHistoryItem, SeasonSummary
│   ├── styles/
│   │   └── globals.css            # Tailwind base + CSS custom properties
│   └── env.d.ts                   # Astro env type declarations
├── public/
│   └── favicon.svg
├── wrangler.toml                  # CF Pages config — keep_vars = true, PUBLIC_API_URL
├── astro.config.mjs               # output: 'server', Cloudflare adapter
├── tailwind.config.mjs
├── tsconfig.json
└── package.json
```

### Pages

| Route | Data source | Notes |
|-------|-------------|-------|
| `/` | Static | Landing — no API call |
| `/prediction` | `GET /api/predictions/upcoming` | Upcoming race prediction |
| `/prediction/[id]` | `GET /api/predictions/race/:id` | Historical prediction |
| `/races` | `GET /api/races?year=N` | Race calendar with year select |
| `/races/[id]` | `GET /api/races/:id` | Results, qualifying, lap chart |
| `/drivers` | `GET /api/drivers/standings?year=N` | Standings table |
| `/drivers/[id]` | `GET /api/drivers/:id?year=N` | Profile + career |
| `/teams` | `GET /api/teams/standings?year=N` | Standings table |
| `/teams/[id]` | `GET /api/teams/:id?year=N` | Profile + driver roster |

### Key Library Files

| File | Purpose |
|------|---------|
| `lib/api.ts` | Single typed API client. All pages call functions from here — never raw `fetch`. |
| `lib/teamColors.ts` | Maps `team_key` strings (e.g. `red_bull`, `ferrari`) to official hex colors. Used for colored badges/dots across standings, driver pages, and result tables. |
| `lib/utils.ts` | `cn()` — combines `clsx` and `tailwind-merge` for conditional class names. |

---

## Database (`db/`)

Migration SQL files generated by `drizzle-kit`. Applied to Neon PostgreSQL.
Schema source of truth is in `api/src/db/schema/` — never edit these SQL files directly.

```
db/
├── migrations/
│   ├── 0000_glamorous_galactus.sql  # Initial schema
│   ├── 0001_useful_old_lace.sql     # Schema additions
│   └── meta/                        # Drizzle migration metadata
└── README.md
```

Run migrations:
```bash
cd db && bun run drizzle-kit push     # dev — apply schema directly
cd db && bun run drizzle-kit migrate  # prod — apply via migration files
```

---

## Data Engine (`data-engine/`)

Python 3.11+ batch jobs. Fetches F1 data via FastF1, computes predictions, writes directly to Neon via psycopg2.

```
data-engine/
├── src/
│   ├── main.py                    # CLI entry point — --job, --year, --round, --race_id
│   │                              # Also auto-detects current race if year/round omitted
│   ├── config.py                  # FastF1 cache setup, environment loading
│   ├── db/
│   │   ├── client.py              # get_conn() — psycopg2 RealDictCursor connection
│   │   └── __init__.py
│   ├── jobs/
│   │   ├── sync_schedule.py       # Populate races table for a season from FastF1
│   │   ├── sync_season.py         # Populate teams + drivers from FastF1 session data
│   │   ├── ingest_qualifying.py   # Qualifying results + sector times — 2018+ (FastF1)
│   │   ├── ingest_qualifying_legacy.py  # Qualifying from Ergast — pre-2018
│   │   ├── ingest_race.py         # Race results + full lap timing — 2018+ (FastF1)
│   │   ├── ingest_race_legacy.py  # Race results from Ergast (no laps) — pre-2018
│   │   ├── compute_season_stats.py# Aggregate driver_season_stats + team_season_stats
│   │   ├── compute_features.py    # Compute 12 feature scores per driver per race
│   │   └── compute_predictions.py # Softmax on feature scores → win probabilities
│   └── utils/
│       ├── fastf1_helpers.py      # get_session(), session_to_race_results(),
│       │                          # session_to_quali_results(), session_to_lap_times(),
│       │                          # get_weather(), get_weather_details(), get_sc_vsc_laps()
│       ├── math_utils.py          # normalize_minmax(), softmax(), bayesian_win_rate(), clamp()
│       └── upsert.py              # Generic INSERT ... ON CONFLICT DO UPDATE helper
├── run_backfill.py                # Full historical backfill runner for a year range
├── backfill_historical.sh         # Shell wrapper for run_backfill.py
├── populate_all.sh                # Shell wrapper for full population
├── render.yaml                    # Render cron job definitions
├── requirements.txt               # Python dependencies
└── .env.example                   # DATABASE_URL template
```

### Jobs

| Job | Input | Purpose |
|-----|-------|---------|
| `sync_schedule` | `--year` | Populates the `races` table from FastF1 |
| `sync_season` | `--year [--round]` | Populates `teams` and `drivers`; must run before any ingest |
| `ingest_qualifying` | `--year --round` | Q1/Q2/Q3 times, sector times, grid positions — 2018+ |
| `ingest_qualifying_legacy` | `--year --round` | Grid positions and Q times via Ergast — pre-2018 |
| `ingest_race` | `--year --round` | Race results + per-lap timing — 2018+ |
| `ingest_race_legacy` | `--year --round` | Race results only via Ergast — pre-2018 |
| `compute_season_stats` | `--year` | Rolling aggregates for all drivers and teams |
| `compute_features` | `--race_id` | 12 feature scores per driver for a specific race |
| `compute_predictions` | `--race_id` | Softmax → win probabilities and predicted positions |

### Utilities

| File | Key functions |
|------|--------------|
| `fastf1_helpers.py` | `get_session()` — loads FastF1 session with correct options per type; `session_to_quali_results()`, `session_to_race_results()`, `session_to_lap_times()` — extract structured dicts from FastF1 DataFrames |
| `math_utils.py` | `normalize_minmax(values)` — min-max to [0,1]; `softmax(scores, temperature=0.3)` — temperature-scaled; `bayesian_win_rate(wins, races)` — Laplace smoothed; `clamp(value)` |
| `upsert.py` | `upsert(conn, table, rows, conflict_cols)` — idempotent bulk write using `ON CONFLICT DO UPDATE` |

---

## Docs (`docs/`)

| File | Content |
|------|---------|
| `architecture.md` | Monorepo layout, ASCII system diagram, data flow through a race weekend |
| `prediction-model.md` | All 12 features with weights, weighted score formula, softmax, data availability by era |
| `data-pipeline.md` | Job descriptions, required chain order, cron schedule, local commands, backfill, idempotency |
| `database-schema.md` | Every table with all columns, types, and notes; ER-style relationship diagram |
| `api-reference.md` | All 17 endpoints with query params, response shapes, error codes |
| `deployment.md` | Env vars for all three platforms, CORS config, first-time setup, local dev |

---

## Claude Skills (`.claude/skills/`)

| Skill | Purpose |
|-------|---------|
| `commit/` | Conventional commit format, domain scopes, and workflow. Always read before committing. |
| `build/` | Build verification runbook |
| `backfill/` | Historical backfill runbook and checklist |
