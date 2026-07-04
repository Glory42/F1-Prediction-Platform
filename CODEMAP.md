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
│   ├── common/constants.ts        # SPRINT_FORMATS — single source of truth shared by all services
│   ├── common/mappers.ts          # toDriver(), toRace(), toCircuit() — canonical mappers used by all services
│   ├── config/database.ts         # createDb() — Drizzle over Neon HTTP driver
│   ├── db/
│   │   ├── schema/                # Drizzle table definitions (source of truth)
│   │   │   ├── index.ts           # Re-exports all schemas
│   │   │   ├── seasons.ts
│   │   │   ├── circuits.ts
│   │   │   ├── teams.ts
│   │   │   ├── drivers.ts
│   │   │   ├── races.ts           # Includes sprint condition columns + event_format
│   │   │   ├── qualifying_results.ts
│   │   │   ├── race_results.ts
│   │   │   ├── lap_times.ts
│   │   │   ├── sprint_results.ts  # Sprint finish + SQ1/SQ2/SQ3 times + sq sector times
│   │   │   ├── sprint_lap_times.ts# Per-lap sprint data
│   │   │   ├── driver_season_stats.ts  # Includes sprint aggregates
│   │   │   ├── team_season_stats.ts
│   │   │   ├── race_predictions.ts
│   │   │   ├── driver_prediction_features.ts
│   │   │   ├── driver_sprint_features.ts  # 8-feature sprint scores
│   │   │   ├── fp2_long_run_times.ts      # FP2 per-driver long-run stint data
│   │   │   └── sprint_predictions.ts      # Sprint predicted winner
│   │   └── seed.ts                # DB seed helpers
│   └── modules/                   # Feature modules (service / controller / module)
│       ├── races/
│       │   ├── races.service.ts   # DB queries — race list, detail, circuit history
│       │   ├── races.controller.ts# Parses context, calls service, returns JSON
│       │   └── races.module.ts    # Hono sub-router: GET /, /circuits, /circuit/:key, /:id
│       ├── drivers/
│       │   ├── drivers.service.ts # Driver list, standings, detail, career stats
│       │   ├── drivers.controller.ts
│       │   └── drivers.module.ts  # GET /, /standings, /:id, /:id/career
│       ├── teams/
│       │   ├── teams.service.ts   # Team list, standings, detail, career stats
│       │   ├── teams.controller.ts
│       │   └── teams.module.ts    # GET /, /standings, /:id, /:id/career
│       ├── predictions/
│       │   ├── predictions.service.ts # Upcoming (date-guarded), by race, history (incl. sprint), standings, model-info
│       │   ├── predictions.controller.ts
│       │   └── predictions.module.ts  # GET /model-info, /upcoming, /race/:id, /history, /standings
│       ├── sprint/
│       │   ├── sprint.service.ts  # Sprint detail — results, SQ grid, lap summaries, prediction
│       │   ├── sprint.controller.ts
│       │   └── sprint.module.ts   # GET /upcoming, /race/:id
│       ├── seasons/
│       │   ├── seasons.service.ts # Season list
│       │   ├── seasons.controller.ts
│       │   └── seasons.module.ts  # GET /
│       └── search/
│           ├── search.service.ts  # Global search query — unique drivers, teams, circuits
│           ├── search.controller.ts
│           └── search.module.ts   # GET /
├── wrangler.toml                  # CF Workers config — keep_vars = true
├── drizzle.config.ts              # Points to api/src/db/schema
├── tsconfig.json                  # CF Workers target — excludes Node-only files (drizzle.config, seed)
├── tsconfig.node.json             # Node target for drizzle.config.ts + seed.ts (@types/node)
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
| GET | `/api/races/circuits` | — |
| GET | `/api/races/circuit/:circuitKey` | — |
| GET | `/api/races/:id` | — |
| GET | `/api/drivers` | `year`, `team_id` |
| GET | `/api/drivers/standings` | `year` |
| GET | `/api/drivers/:id` | `year` |
| GET | `/api/drivers/:id/career` | — |
| GET | `/api/teams` | `year` |
| GET | `/api/teams/standings` | `year` |
| GET | `/api/teams/:id` | `year` |
| GET | `/api/teams/:id/career` | — |
| GET | `/api/predictions/model-info` | — |
| GET | `/api/predictions/upcoming` | — |
| GET | `/api/predictions/race/:raceId` | — |
| GET | `/api/predictions/history` | `year` |
| GET | `/api/predictions/standings` | `year` |
| GET | `/api/sprint/upcoming` | — |
| GET | `/api/sprint/race/:raceId` | — |

---

## Frontend (`web/`)

Astro SSR with Cloudflare adapter. All data fetching is server-side in Astro frontmatter — no client-side data fetching.

```
web/
├── src/
│   ├── content/
│   │   └── config.ts              # Astro Content Layer — docs collection via glob('../docs')
│   ├── pages/                     # File-based routes
│   │   ├── index.astro            # Landing page (static)
│   │   ├── prediction.astro       # Upcoming prediction + history (GP + sprint merged)
│   │   ├── prediction/[id].astro  # Historical GP prediction by race
│   │   ├── docs/
│   │   │   ├── index.astro        # Docs index — card grid of all docs
│   │   │   └── [slug].astro       # Individual doc page with sidebar nav
│   │   ├── circuits/
│   │   │   ├── index.astro        # Circuits directory index (filters/sorting)
│   │   │   └── [key].astro        # Circuit detail — history, dominance, weather
│   │   ├── races/
│   │   │   ├── index.astro        # Race calendar — sprint-aware cards
│   │   │   └── [id]/
│   │   │       ├── index.astro    # Race detail — results, qualifying, lap chart
│   │   │       └── sprint.astro   # Sprint detail — results, SQ grid, lap chart, conditions
│   │   ├── prediction/
│   │   │   └── sprint/
│   │   │       └── [id].astro     # Sprint prediction detail page
│   │   ├── drivers/
│   │   │   ├── index.astro        # Driver standings table
│   │   │   ├── compare.astro      # Driver head-to-head comparison tool
│   │   │   └── [id].astro         # Driver profile — stats, recent results
│   │   └── teams/
│   │       ├── index.astro        # Team standings table
│   │       ├── compare.astro      # Team head-to-head comparison tool
│   │       └── [id].astro         # Team profile — stats, driver roster
│   ├── layouts/
│   │   ├── BaseLayout.astro       # Shared layout — Navbar, slot, global styles
│   │   └── LandingLayout.astro    # Landing-specific layout (no navbar chrome)
│   ├── components/
│   │   ├── Navbar.astro           # Top navigation bar
│   │   ├── Footer.astro           # Shared footer; variant="minimal" (default) | "full" (landing)
│   │   ├── YearSelect.astro       # Year selector; extraParams prop preserves filter/sort on year change
│   │   ├── YearSelectLinks.astro  # Year selector using anchor links
│   │   ├── RaceYearSelect.astro   # Year selector for race/sprint detail; variant="orange"|"purple", extraParams prop
│   │   ├── LapChart.astro         # Plain SVG lap time chart (no chart library)
│   │   ├── ProbabilityBar.astro   # Inline win probability bar
│   │   ├── PredictionTable.tsx    # Driver prediction table with feature breakdown
│   │   ├── RaceResultsTable.tsx   # Race results with team color dots; flColor prop for sprint (orange)
│   │   ├── RecentResultsTable.tsx # Compact recent results table
│   │   ├── QualifyingGrid.tsx     # Qualifying session grid; labelPrefix prop ("Q" or "SQ")
│   │   ├── DriverStatsGrid.tsx    # Driver season stats card grid
│   │   ├── TeamStatsCard.tsx      # Team season stats card
│   │   ├── GlobalSearch.tsx       # React global search palette (cmdk)
│   │   ├── CircuitsGrid.tsx       # React component for circuits grid (filters/sorting)
│   │   ├── WeatherForecast.tsx    # React weather forecast widget (Open-Meteo API)
│   │   ├── DriverCompareTool.tsx  # React component for driver head-to-head stats comparison
│   │   ├── TeamCompareTool.tsx    # React component for team head-to-head stats comparison
│   │   └── ui/                    # Shadcn/ui primitives
│   │       ├── badge.tsx
│   │       ├── button.tsx
│   │       ├── card.tsx
│   │       └── table.tsx
│   ├── lib/
│   │   ├── api.ts                 # Typed API client — all fetch calls, uses PUBLIC_API_URL
│   │   ├── teamColors.ts          # team_key → official hex color map (fallback #6B7280)
│   │   ├── teamLogos.ts           # team_key → /teams/<file> static logo path (null if no logo)
│   │   ├── countryFlags.ts        # country → emoji flag helper
│   │   ├── circuitMetadata.ts     # Track coordinate and telemetry configuration
│   │   └── utils.ts               # cn() helper (clsx + tailwind-merge)
│   ├── types/
│   │   └── index.ts               # All TypeScript types — Circuit, Team, Driver, Race,
│   │                              #   RaceResult, QualifyingResult, LapSummary,
│   │                              #   DriverSeasonStats, TeamSeasonStats, FeatureScores,
│   │                              #   DriverPrediction, PredictionResponse, RaceDetailResponse,
│   │                              #   DriverDetailResponse, TeamDetailResponse,
│   │                              #   DriverStanding, TeamStanding, PredictionHistoryItem (isSprint),
│   │                              #   IntelStandingRow, CircuitHistoryItem (hasSprint), SeasonSummary,
│   │                              #   SprintResult, SprintFeatureScores, DriverSprintPrediction,
│   │                              #   SprintPredictionResponse, SprintDetailResponse, ModelInfo
│   ├── styles/
│   │   └── globals.css            # Tailwind base + CSS custom properties
│   └── env.d.ts                   # Astro env type declarations
├── public/
│   ├── favicon.svg
│   └── teams/                     # Static team logo files (PNG/SVG/JPG) served at /teams/<teamKey>.*
├── wrangler.toml                  # CF Pages config — keep_vars = true, PUBLIC_API_URL
├── astro.config.mjs               # output: 'server', Cloudflare adapter
├── tailwind.config.mjs
├── tsconfig.json
└── package.json
```

### Pages

| Route | Data source | Notes |
|-------|-------------|-------|
| `/docs` | Astro Content Collections | Doc index — card grid of all 6 docs |
| `/docs/[slug]` | Astro Content Collections | Rendered markdown with sidebar nav |
| `/` | Static | Landing — no API call |
| `/prediction` | `GET /api/predictions/upcoming` + `/api/sprint/upcoming` | GP + sprint upcoming; history merged |
| `/prediction/[id]` | `GET /api/predictions/race/:id` | Historical GP prediction |
| `/races` | `GET /api/races?year=N` | Race calendar — filter (ALL/SPRINT/GP), sort (ASC/DESC), sprint weekends as two cards |
| `/races/[id]` | `GET /api/races/:id` | GP results, qualifying, lap chart |
| `/races/[id]/sprint` | `GET /api/sprint/race/:id` | Sprint results, SQ grid, sprint lap chart, conditions |
| `/circuits` | `GET /api/races/circuits` | Circuits directory list page |
| `/circuits/[key]` | `GET /api/races/circuit/:circuitKey` | Circuit detail — history, dominance, weather |
| `/drivers` | `GET /api/drivers/standings?year=N` | Standings table |
| `/drivers/compare` | `GET /api/drivers?year=N` + details | Driver head-to-head comparison page |
| `/drivers/[id]` | `GET /api/drivers/:id?year=N` | Profile + career |
| `/teams` | `GET /api/teams/standings?year=N` | Standings table |
| `/teams/compare` | `GET /api/teams?year=N` + details | Team head-to-head comparison page |
| `/teams/[id]` | `GET /api/teams/:id?year=N` | Profile + driver roster |

### Key Library Files

| File | Purpose |
|------|---------|
| `lib/api.ts` | Single typed API client. All pages call functions from here — never raw `fetch`. |
| `lib/teamColors.ts` | Maps `team_key` strings (e.g. `red_bull`, `ferrari`) to official hex colors. Used for colored badges/dots across standings, driver pages, and result tables. |
| `lib/teamLogos.ts` | Maps `team_key` to a static logo path under `/teams/`. Returns `null` for historical teams with no logo file. Used on teams index, teams detail, and drivers standings pages. |
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
│   ├── auto_runner.py             # Orchestrates ETL jobs via state machine; reverts status on failure
│   ├── server.py                  # HTTP server exposing a live dashboard and /health for UptimeRobot
│   ├── main.py                    # CLI entry point — --job, --year, --round, --race_id
│   │                              # Also auto-detects current race if year/round omitted
│   ├── config.py                  # FastF1 cache setup, environment loading
│   ├── db/
│   │   ├── client.py              # get_conn() — psycopg2 RealDictCursor connection
│   │   └── __init__.py
│   ├── jobs/
│   │   ├── sync_schedule.py            # Populate races table — includes sprint_date, event_format
│   │   ├── sync_season.py              # Populate teams + drivers from FastF1 session data
│   │   ├── ingest_qualifying.py        # Q1/Q2/Q3 + sector times — 2018+; date guard rejects future rounds
│   │   ├── ingest_qualifying_legacy.py # Qualifying from Ergast — pre-2018
│   │   ├── ingest_race.py              # Race results + lap times + conditions — 2018+
│   │   ├── ingest_race_legacy.py       # Race results from Ergast (no laps) — pre-2018
│   │   ├── ingest_sprint_qualifying.py # SQ session → sq1/sq2/sq3 + sector times + speed; messages=True; date guard
│   │   ├── ingest_fp2.py               # FP2 long-run stint data → fp2_long_run_times
│   │   ├── ingest_sprint.py            # Sprint results + sprint_lap_times + sprint conditions
│   │   ├── compute_season_stats.py     # Aggregate driver/team stats including sprint aggregates
│   │   ├── compute_features.py         # 12 feature scores per driver per GP
│   │   ├── compute_predictions.py      # Softmax on GP feature scores → win probabilities
│   │   ├── compute_sprint_features.py  # 8 sprint feature scores per driver
│   │   └── compute_sprint_predictions.py # Softmax on sprint scores → sprint win probabilities
│   └── utils/
│       ├── fastf1_helpers.py      # get_session(messages=False), session_to_race_results(),
│       │                          # session_to_quali_results(), session_to_lap_times(),
│       │                          # get_weather(), get_weather_details(), get_sc_vsc_laps()
│       ├── math_utils.py          # normalize_minmax(), softmax(), bayesian_win_rate(), clamp()
│       └── upsert.py              # upsert(conn, table, rows, conflict_cols, exclude_update=[])
├── backfill_all_predictions.py    # Recompute GP + sprint predictions for all races (weighted-v3 / sprint-v2)
├── backfill_fp2.py                # Backfill FP2 long-run data for 2018+ completed races
├── backfill_full.py               # Full historical backfill: sync + ingest + sprint + predictions
├── backfill_sprint.py             # Sprint-only backfill for specific years
├── render.yaml                    # Render cron job definitions
├── requirements.txt               # Python dependencies
└── .env.example                   # DATABASE_URL template
```

### Jobs

| Job | Input | Purpose |
|-----|-------|---------|
| `sync_schedule` | `--year` | Populates `races` table with sprint dates and event_format |
| `sync_season` | `--year [--round]` | Populates `teams` and `drivers`; must run before any ingest |
| `ingest_qualifying` | `--year --round` | Q1/Q2/Q3 times, sector times, grid positions — 2018+ |
| `ingest_qualifying_legacy` | `--year --round` | Grid positions and Q times via Ergast — pre-2018 |
| `ingest_race` | `--year --round` | Race results + per-lap timing + conditions — 2018+ |
| `ingest_race_legacy` | `--year --round` | Race results only via Ergast — pre-2018 |
| `ingest_sprint_qualifying` | `--year --round` | SQ session → sprint_results (sq1/sq2/sq3 + sector times + speed); date guard rejects future rounds |
| `ingest_fp2` | `--year --round` | FP2 long-run stints → `fp2_long_run_times`; used as primary long-run pace signal |
| `ingest_sprint` | `--year --round` | Sprint results + sprint_lap_times + sprint conditions; sprint weekends only |
| `compute_season_stats` | `--year` | Rolling aggregates for drivers and teams, including sprint stats |
| `compute_features` | `--race_id` | 12 feature scores per driver for a GP |
| `compute_predictions` | `--race_id` | Softmax → GP win probabilities and predicted positions |
| `compute_sprint_features` | `--race_id` | 8 sprint feature scores per driver |
| `compute_sprint_predictions` | `--race_id` | Softmax → sprint win probabilities and predicted positions |

### Utilities

| File | Key functions |
|------|--------------|
| `fastf1_helpers.py` | `get_session(year, round, type, messages=False)` — loads FastF1 session (SQ sessions need `messages=True`); `session_to_quali_results()`, `session_to_race_results()`, `session_to_lap_times()` — extract structured dicts from FastF1 DataFrames |
| `math_utils.py` | `normalize_minmax(values)` — min-max to [0,1]; `softmax(scores, temperature=0.3)` — temperature-scaled; `bayesian_win_rate(wins, races)` — Laplace smoothed; `clamp(value)` |
| `upsert.py` | `upsert(conn, table, rows, conflict_cols, exclude_update=[])` — idempotent bulk write; `exclude_update` prevents overwriting specified columns (used to protect sprint race data from SQ re-ingest) |

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
