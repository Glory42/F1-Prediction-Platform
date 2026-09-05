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
│   ├── data-pipeline.md   # ETL job chain, cron schedule, backfill
│   ├── database-schema.md # All tables, columns, and relationships
│   ├── prediction-model.md# Feature weights, scoring formula, softmax
│   ├── rulebased-architecture.md # Per-feature inventory of the weighted-v3 predictor
│   ├── api-reference.md   # All endpoints, params, and response shapes
│   ├── frontend.md        # Astro app — routing, server-only fetch rule, component layout
│   ├── deployment.md      # Env vars, Cloudflare setup, first-time steps
│   └── testing.md         # The five test suites — coverage, how to run, CI
├── apps/                  # JS/Bun-only convention — orchestrated by root package.json, no workspaces
│   ├── api/               # Hono REST API — Cloudflare Workers; also owns Drizzle schema + migrations
│   ├── web/               # Astro SSR frontend — Cloudflare Pages
│   └── e2e/               # Playwright smoke tests for apps/web — own package.json + playwright.config.ts
├── data-engine/           # Python ETL batch jobs — Render (outside apps/: no dev server, one-shot jobs)
└── .claude/skills/        # Claude Code skill definitions
    ├── commit/            # Conventional commit format and workflow
    ├── build/             # Build verification skill
    └── backfill/          # Historical backfill runbook
```

---

## API (`apps/api/`)

Hono on Cloudflare Workers. NestJS-style module structure.
Must use `@neondatabase/serverless` (HTTP driver) — no TCP in Workers.

```
apps/api/
├── src/
│   ├── main.ts                    # Entry point — registers CORS, logger, modules
│   ├── common/types.ts            # Bindings + all response types
│   ├── common/constants.ts        # SPRINT_FORMATS — single source of truth shared by all services
│   ├── common/mappers.ts          # toDriver(), toTeam(), toRace(), toCircuit(), toRaceResult(), toQualifyingResult(), toSprintResult() — canonical row→DTO mappers used by all services
│   ├── common/collections.ts      # toKeyedMap(rows, keyFn, valueFn?) — shared Map-by-id builder used by all services
│   ├── common/standings.ts        # resolveSeason(), buildStandings(), buildCareerStats(), sortByChampionshipStanding() — shared standings/career-stats pipeline for drivers, teams, predictions
│   ├── common/prediction-response.ts  # buildPredictionResponse(db, config) — shared GP/sprint prediction pipeline (winner lookup, feature mapping, response assembly); used by predictions.service.ts + sprint.service.ts
│   ├── common/prediction-history.ts   # buildHistoryItems(), buildWinnerMap(), buildProbPosMaps(), mergeHistoryByDateDesc() — pure GP/sprint prediction-history assembly for predictions.service.findHistory()
│   ├── common/cache.ts             # cacheControlForStatus(), cacheControlForYear() — Cache-Control header rules for completed vs in-progress races
│   ├── common/accuracy.ts          # aggregateAccuracyBySeason() — groups PredictionHistoryItem[] into per-season gp/sprint/overall accuracy buckets
│   ├── common/featureManifest.ts   # GP_FEATURE_MANIFEST/SPRINT_FEATURE_MANIFEST (key, column, label, nullable) +
│   │                               #   mapFeatureRow() — weight-less local manifest (apps/api never computes with
│   │                               #   weights); derives toFeatures()/toSprintFeatures() and intel-standings.helpers.ts's
│   │                               #   aggregation columns from one place instead of three
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
│       │   ├── circuit-era.helpers.ts     # Pure era bucketing for findCircuitDetails — Era/EraMap/ERAS, aggregateEraWins(), buildDominanceByEra(), normalizeTeamKey()
│       │   ├── circuit-stats.helpers.ts   # Pure per-response stat computations — buildCircuitHistory(), computeQualifyingImpactStats/WeatherStats/SafetyCarStats(), pickFastestLap(); owns WinnerRow/FastestLapRow
│       │   ├── circuit-headshot-backfill.ts # backfillDriverHeadshots() — the one DB-reading enrichment (swaps latest driver profiles into per-era win entries in place; no writes)
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
│       │   ├── predictions.service.ts # Upcoming (date-guarded), by race, history (incl. sprint), accuracy-by-season, standings, model-info
│       │   ├── predictions.helpers.ts # toFeatures() (GP feature row→DTO) + buildGpPredictionResponse() — the GP-specific query builders over common/prediction-response
│       │   ├── intel-standings.helpers.ts # aggregateSeasonFeatures() (table-driven per-feature averaging) + buildIntelStandingRows() (rank + min-max normalise + sprint totals) for findIntelStandings()
│       │   ├── predictions.controller.ts
│       │   └── predictions.module.ts  # GET /model-info, /upcoming, /race/:id, /history, /accuracy, /standings
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
│       └── quality/
│           ├── quality.service.ts # Latest data-quality report (reads data_quality_runs/issues)
│           ├── quality.controller.ts
│           └── quality.module.ts  # GET / — dev-only reporting (no write path)
├── drizzle/
│   └── migrations/                # Generated SQL migration files + Drizzle metadata
│       ├── 0000_glamorous_galactus.sql  # Initial schema
│       ├── 0001_useful_old_lace.sql     # Schema additions
│       └── meta/                        # Drizzle migration metadata (_journal.json, snapshots)
├── tests/
│   ├── unit/
│   │   ├── modules/
│   │   │   ├── quality/           # quality.service test (severity casting)
│   │   │   └── predictions/       # intel-standings.helpers test (feature averaging + standings normalise)
│   │   └── common/                # bun test — mirrors src/common/, one *.test.ts per file
│   │       ├── mappers.test.ts
│   │       ├── collections.test.ts
│   │       ├── standings.test.ts
│   │       ├── prediction-response.test.ts
│   │       ├── prediction-history.test.ts
│   │       ├── cache.test.ts
│   │       └── accuracy.test.ts
│   ├── integration/                # bun test — real Hono `app.request()` against a dedicated Neon test branch
│   │   ├── races/races.test.ts     # list/filter/detail/circuit-history joins
│   │   ├── drivers/drivers.test.ts # list/filter/standings/detail
│   │   ├── teams/teams.test.ts     # list/standings/detail
│   │   ├── seasons/seasons.test.ts # race-count aggregation
│   │   └── search/search.test.ts   # cross-season dedup
│   └── support/
│       ├── app/request.ts          # apiRequest() — in-process app.request() with TEST_DATABASE_URL env
│       ├── db/test-db.ts           # getTestDb()/truncateAll() — refuses to truncate if TEST_DATABASE_URL === DATABASE_URL
│       └── factories/              # one insert helper per table, FK chain: season → team/circuit → driver → race → results
├── eslint.config.js               # Flat config — tiered `max-lines` (controller 80 / module 50 / service+helpers 200 / common 150 / default 150; schema+seed+types.ts+tests off), run via `bun run lint`
├── wrangler.toml                  # CF Workers config — keep_vars = true
├── drizzle.config.ts              # schema: src/db/schema, out: drizzle/migrations
├── tsconfig.json                  # CF Workers target — excludes Node-only files (drizzle.config, seed)
├── tsconfig.node.json             # Node target for drizzle.config.ts + seed.ts (@types/node)
├── .env.example                   # DATABASE_URL + TEST_DATABASE_URL
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
| GET | `/api/predictions/accuracy` | — |
| GET | `/api/predictions/standings` | `year` |
| GET | `/api/sprint/upcoming` | — |
| GET | `/api/sprint/race/:raceId` | — |

---

## Frontend (`apps/web/`)

Astro SSR with Cloudflare adapter. All data fetching is server-side in Astro frontmatter — no client-side data fetching.

```
apps/web/
├── src/
│   ├── content/
│   │   └── config.ts              # Astro Content Layer — docs collection via glob('../../docs')
│   ├── pages/                     # File-based routes
│   │   ├── index.astro            # Landing page (static)
│   │   ├── prediction.astro       # Upcoming prediction + history (GP + sprint merged) + calibration chart + Brier
│   │   ├── prediction/[id].astro  # Historical GP prediction — contribution breakdown, radar compare, what-if lab
│   │   ├── health-quality.astro   # Dev-only data-quality dashboard (404-guarded outside DEV)
│   │   ├── docs/
│   │   │   ├── index.astro        # Docs index — card grid of all docs
│   │   │   └── [slug].astro       # Individual doc page — all-docs sidebar, content, on-this-page rail
│   │   ├── circuits/
│   │   │   ├── index.astro        # Circuits directory index (filters/sorting)
│   │   │   └── [key].astro        # Circuit detail — history, dominance, weather
│   │   ├── races/
│   │   │   ├── index.astro        # Race calendar — sprint-aware cards
│   │   │   └── [id]/
│   │   │       ├── index.astro    # Race detail — results, qualifying, lap chart
│   │   │       └── sprint.astro   # Sprint detail — results, SQ grid, lap chart, conditions
│   │   ├── prediction/
│   │   │   ├── sprint/
│   │   │   │   └── [id].astro     # Sprint prediction detail — same feature set as GP, sprint model (8 weights)
│   │   │   └── recap/
│   │   │       ├── index.astro    # All-seasons recap landing — accuracy card per season
│   │   │       └── [year].astro   # Season recap — headline accuracy, best call, worst miss, streak, round strip
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
│   ├── components/                # Generic, cross-feature only — domain UI lives in features/
│   │   ├── layout/
│   │   │   ├── Navbar.astro       # Top bar + desktop nav (hover dropdowns for races/drivers/teams/prediction)
│   │   │   ├── MobileNav.astro    # Mobile drawer + accordion nav + focus-trap script
│   │   │   ├── navLinks.ts        # buildNavLinks(isDev) + isNavActive() — shared nav model
│   │   │   └── Footer.astro       # Shared footer; variant="minimal" (default) | "full" (landing)
│   │   ├── docs/
│   │   │   └── OnThisPage.astro   # Sticky right-rail TOC of a doc's h2 sections; scrollspy via IntersectionObserver
│   │   ├── shared/
│   │   │   ├── YearSelect.astro       # Year selector; extraParams prop preserves filter/sort on year change
│   │   │   ├── YearSelectLinks.astro  # Year selector using anchor links; used by driver/team profile pages
│   │   │   └── ConfidenceBadge.astro  # LOCK / LIKELY / TOSS-UP badge from the P1−P2 win-probability gap
│   │   └── ui/                    # Shadcn/ui primitives + generic widgets
│   │       ├── badge.tsx
│   │       ├── button.tsx
│   │       ├── card.tsx
│   │       ├── table.tsx
│   │       └── search-select.tsx  # Generic autocomplete combobox; shared by Driver/TeamCompareTool
│   ├── features/
│   │   ├── predictions/              # Shared prediction UI — GP + sprint pages compose these (accent prop)
│   │   │   ├── types.ts               # PredictionAccent, GP_ACCENT/SPRINT_ACCENT, view-model interfaces
│   │   │   ├── buildPredictionPageData.ts  # buildPredictionPageData(kind, raceId) — the fetch/winner-pick/
│   │   │   │                          #   view-model assembly both prediction/[id].astro and prediction/sprint/[id].astro
│   │   │   │                          #   call; every GP-vs-sprint difference lives in its one KIND_CONFIG table
│   │   │   └── components/
│   │   │       ├── PredictionHeader.astro          # Round kicker + title + ConfidenceBadge + circuit/model lines
│   │   │       ├── PredictionOutcomeBanner.astro   # Predicted → actual winner banner
│   │   │       ├── ContributionBar.astro           # "why {CODE}" — stacked bar of each feature's weighted-score share
│   │   │       ├── PredictionDriverTable.astro     # Full ranked driver table (accent via scoped <style define:vars>)
│   │   │       ├── DriverRadarCompare.astro        # 2-driver radar; bundled <script> reads a JSON payload node
│   │   │       ├── ModelWeightsGrid.astro          # Feature-weight grid (rendered xl + mobile per page)
│   │   │       ├── WhatIfLab.astro                 # Re-weight sliders; recompute weightedScore→softmax(0.3) in-browser
│   │   │       ├── CalibrationChart.astro          # Predicted vs actual win-rate scatter + perfect-calibration diagonal
│   │   │       └── UpcomingPredictionPanel.astro   # /prediction hero panel (GP + sprint share it)
│   │   ├── races/
│   │   │   ├── raceTabs.ts            # initRaceCountdown() + initRaceTabs() — shared by GP + sprint detail scripts
│   │   │   └── components/
│   │   │       ├── LapChart.astro         # Plain SVG lap time chart (no chart library)
│   │   │       ├── RaceResultsTable.tsx   # Race results with team color dots; flColor prop for sprint (orange)
│   │   │       ├── QualifyingGrid.tsx     # Qualifying session grid; labelPrefix prop ("Q" or "SQ")
│   │   │       ├── RaceYearSelect.astro   # Year selector for race/sprint detail; variant="orange"|"purple", extraParams prop
│   │   │       ├── RaceHeroInfo.astro     # Hero left column — status badge, meta, conditions strip, countdown (accent prop)
│   │   │       └── RacePredictionPanel.astro  # Hero right column — predicted winner + podium (accent prop)
│   │   ├── drivers/components/
│   │   │   ├── DriverStatsGrid.tsx    # Driver season stats card grid
│   │   │   └── RecentResultsTable.tsx # Compact recent results table
│   │   ├── circuits/
│   │   │   ├── components/
│   │   │   │   ├── CircuitsGrid.tsx      # React component for circuits grid (filters/sorting)
│   │   │   │   ├── WeatherForecast.tsx   # React weather forecast widget (Open-Meteo API)
│   │   │   │   ├── CircuitTelemetryCard.astro  # Longest straight, corner distribution, track bias bars
│   │   │   │   ├── CircuitWinnersTable.astro   # Recent-winners list for the circuit
│   │   │   │   └── DominanceCard.astro         # Era-filtered constructor/driver dominance + tab script
│   │   │   ├── circuitMetadata.ts     # Track coordinate and telemetry configuration
│   │   │   └── weather.ts             # Open-Meteo forecast fetch + ForecastDay type
│   │   ├── compare/
│   │   │   ├── components/
│   │   │   │   ├── DriverCompareTool.tsx  # Driver head-to-head comparison — entity-specific config over shared compare pieces
│   │   │   │   ├── TeamCompareTool.tsx    # Team head-to-head comparison — entity-specific config over shared compare pieces
│   │   │   │   ├── ComparisonRow.tsx      # Generic stat comparison bar; shared by Driver/TeamCompareTool
│   │   │   │   ├── CompareEntityCard.tsx  # Generic profile card (avatar/logo + name + subtitle); shared by Driver/TeamCompareTool
│   │   │   │   ├── CompareModeToggle.tsx  # Season/career mode switch
│   │   │   │   ├── CompareYearSelect.tsx  # Year selector variant for compare tools
│   │   │   │   └── CompareStatus.tsx      # Loading/error/empty-stats status display
│   │   │   ├── compareStats.ts        # aggregateCareerStats() + DEFAULT_COMPARE_YEAR — career stat aggregation
│   │   │   ├── driverCompareConfig.ts # seasonStatConfig + careerStatConfig — the driver stat rows
│   │   │   └── useCompareController.ts # Generic compare-tool state hook — URL sync via injectable locationAdapter, discriminated season/career `comparison` result
│   │   └── search/
│   │       ├── components/
│   │       │   └── GlobalSearch.tsx   # React global search palette (cmdk) — render only
│   │       └── useGlobalSearch.ts     # Search-open state hook (keyboard shortcut, Navbar event bridge, fetch-on-open, close animation)
│   ├── lib/                       # Only truly cross-feature helpers
│   │   ├── api.ts                 # Typed API client — all fetch calls, uses PUBLIC_API_URL
│   │   ├── teamColors.ts          # team_key → official hex color map (fallback #6B7280)
│   │   ├── teamLogos.ts           # team_key → /teams/<file> static logo path (null if no logo)
│   │   ├── countryFlags.ts        # country → emoji flag helper
│   │   ├── predictionMath.ts      # weightedScore, softmax (SOFTMAX_TEMPERATURE=0.3), radarFeatures(), contributions,
│   │   │                          #   confidenceTier, brierScore, calibrationBuckets, driverPredictionRecord,
│   │   │                          #   bestCall/worstMiss/longestStreak, GP_WEIGHTS/SPRINT_WEIGHTS + *_FEATURE_META
│   │   │                          #   (the canonical TS-side manifest, checked against docs/feature-weights.json)
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
├── tests/
│   ├── unit/
│   │   ├── compare/
│   │   │   ├── compareStats.test.ts          # aggregateCareerStats() — pure, `node` env
│   │   │   └── useCompareController.test.ts  # jsdom — URL hydration, career mode, location-adapter seam
│   │   ├── lib/
│   │   │   ├── teamColors.test.ts            # pure, `node` env
│   │   │   ├── teamLogos.test.ts             # pure, `node` env
│   │   │   └── predictionMath.test.ts        # pure, `node` env — all predictionMath exports
│   │   └── features/search/                  # jsdom — hook + component tests, MSW-mocked API
│   │       ├── useGlobalSearch.test.ts
│   │       └── GlobalSearch.test.tsx
│   └── support/
│       ├── setup.ts                # jest-dom matchers, MSW server lifecycle, ResizeObserver stub for cmdk
│       └── msw/                    # fixtures.ts + handlers.ts — mocks src/lib/api.ts endpoints
├── vitest.config.ts                # jsdom is opt-in per file via `// @vitest-environment jsdom`; default env is `node`
├── eslint.config.js              # Flat config — tiered `max-lines` (pages 300 / components 250 / lib 200), run via `bun run lint`
├── wrangler.toml                  # CF Pages config — keep_vars = true, PUBLIC_API_URL
├── astro.config.mjs               # output: 'server', Cloudflare adapter
├── tailwind.config.mjs
├── tsconfig.json
└── package.json
```

### Pages

| Route | Data source | Notes |
|-------|-------------|-------|
| `/docs` | Astro Content Collections | Doc index — card grid of all 9 docs |
| `/docs/[slug]` | Astro Content Collections | Rendered markdown with sidebar nav + on-this-page rail |
| `/` | Static | Landing — no API call |
| `/prediction` | `GET /api/predictions/upcoming` + `/api/sprint/upcoming` + `/api/predictions/accuracy` | GP + sprint upcoming; history merged; accuracy table; calibration chart + Brier when ≥5 races done |
| `/prediction/[id]` | `GET /api/predictions/race/:id` | Historical GP prediction — contribution breakdown, radar compare, in-browser what-if lab |
| `/prediction/sprint/[id]` | `GET /api/sprint/race/:id` | Sprint prediction detail — same feature set, sprint model |
| `/prediction/recap` | `GET /api/predictions/accuracy` | All-seasons recap landing — accuracy card per season |
| `/prediction/recap/[year]` | `GET /api/predictions/history?year=N` | Season recap — best call, worst miss, longest streak, round strip |
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
| `features/compare/useCompareController.ts` | Generic hook powering both compare tools — item list, A/B selection, discriminated `comparison` (season/career) result, URL sync through an injectable `locationAdapter` seam. |
| `features/search/useGlobalSearch.ts` | Hook powering `GlobalSearch` — open/close state, Cmd/Ctrl+K + Escape keyboard shortcut, `open-global-search` event bridge from `Navbar.astro`, fetch-on-first-open, close-animation timing. |

---

## E2E (`apps/e2e/`)

Own package — see `docs/adr/0001-apps-layout-scoped-to-js-bun.md` for why this isn't nested under
`apps/web/`. Playwright drives a real browser against `apps/web`'s `astro dev` server; a fixture
HTTP server stands in for `apps/api` since the pages under test fetch data server-side (in Astro
frontmatter), where Playwright's own request interception can't reach.

The fixture server also needs CORS headers (`Access-Control-Allow-Origin`), even though every
other route is only ever hit server-side: `GlobalSearch`/`DriverCompareTool`/`TeamCompareTool`
fetch client-side (the sanctioned exception in the web app's data-fetching rule), so from the
browser that's a real cross-origin request to the fixture server's port, subject to the same CORS
enforcement the real Hono API's `cors()` middleware handles in production.

```
apps/e2e/
├── fixtures/
│   ├── data.ts                    # Typed fixture objects (Driver, Race, PredictionResponse, ...)
│   └── server.ts                  # Bun.serve() — serves { data, error: null } + CORS headers for the routes under test
├── tests/
│   └── smoke/
│       ├── prediction.spec.ts      # /prediction renders against fixture data
│       ├── race-detail.spec.ts     # /races/1 renders against fixture data
│       ├── driver-detail.spec.ts   # /drivers/10 — stats grid + recent results
│       ├── team-detail.spec.ts     # /teams/1 — stats + driver roster
│       ├── global-search.spec.ts   # Cmd/Ctrl+K opens, shows results, Escape closes (client-side fetch)
│       └── driver-compare.spec.ts  # /drivers/compare — URL-param-driven season comparison (client-side fetch)
├── playwright.config.ts           # webServer: [fixture server, `astro dev` in ../web]
├── tsconfig.json
└── package.json
```

---

## Data Engine (`data-engine/`)

Python 3.11+ batch jobs. Fetches F1 data via FastF1, computes predictions, writes directly to Neon via psycopg2.

```
data-engine/
├── src/
│   ├── auto_runner.py             # Orchestrates ETL jobs via state machine; reverts status on failure.
│   │                              # Schedule-gated: skips the DB entirely outside a race-weekend window
│   ├── server.py                  # HTTP server exposing a live dashboard and /health for UptimeRobot;
│   │                              # worker loop polls ~20 min in-window, ~6 h otherwise
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
│   │   ├── ingest_fp2.py               # Practice long-run stint data → fp2_long_run_times (FP2 primary; FP1 fallback on sprint weekends)
│   │   ├── ingest_sprint.py            # Sprint results + sprint_lap_times + sprint conditions
│   │   ├── compute_season_stats.py     # Aggregate driver/team stats including sprint aggregates
│   │   ├── compute_features.py         # 12 feature scores per driver per GP
│   │   ├── compute_predictions.py      # Softmax on GP feature scores → win probabilities
│   │   ├── compute_sprint_features.py  # 8 sprint feature scores per driver
│   │   ├── compute_sprint_predictions.py # Softmax on sprint scores → sprint win probabilities
│   │   ├── data_quality_audit.py        # Per-table completeness/coverage audit → data_quality_runs/issues
│   │   └── data_quality_repair.py       # Re-ingests data for fixable audit issues; recomputes features/predictions
│   └── utils/
│       ├── fastf1_helpers.py      # get_session(messages=False), session_to_race_results(),
│       │                          # session_to_quali_results(), session_to_lap_times(),
│       │                          # get_weather(), get_weather_details(), get_sc_vsc_laps()
│       ├── feature_manifest.py    # GP_FEATURES/SPRINT_FEATURES (name, weight, label, nullable) — the single source
│       │                          # for both models' weights; GP_WEIGHTS/SPRINT_WEIGHTS + assemble_scores() +
│       │                          # SOFTMAX_TEMPERATURE derive from it; checked against docs/feature-weights.json
│       ├── math_utils.py          # normalize_minmax(), softmax(), bayesian_win_rate(), clamp(), weighted_sum()
│       ├── upsert.py              # upsert(conn, table, rows, conflict_cols, exclude_update=[])
│       ├── driver_map.py          # build_driver_code_map(conn, season_id) — shared driver code→id lookup for ingest jobs
│       ├── prediction_runner.py   # run_prediction_job(...) — shared softmax/rank/upsert logic for GP + sprint predictions
│       ├── ingest_runner.py       # Two seams: run_ingest_job(...) — shared headshot/results/lap-time/status logic for
│       │                          # ingest_race + ingest_sprint; run_qualifying_ingest_job(...) — shared logic for
│       │                          # ingest_qualifying + ingest_sprint_qualifying (no weather/laps/headshots)
│       ├── feature_helpers.py     # Shared scoring math for GP + sprint models — compute_weather_score(),
│       │                          # compute_luck_score(), circuit_adj_start_pos(), compute_rolling_teammate_delta()
│       ├── feature_context.py     # build_feature_context() — shared query/assembly scaffolding (race+circuit row,
│       │                          # grid map, start_pos, driver/team season stats) behind both feature jobs
│       ├── quality_utils.py       # health_from_issues() + resolve_issue_actions() — pure audit/repair scoring logic
│       └── schedule_window.py     # race_weekend_window() — pure race-weekend window from the FastF1 calendar, no DB
├── scripts/                       # One-off/operational scripts — not imported by src/
│   ├── run_backfill.py            # Full historical backfill runner — sync + ingest + compute, per year range
│   ├── backfill_full.py           # Full historical backfill: sync + ingest + sprint + predictions
│   ├── backfill_sprint.py         # Sprint-only backfill for specific years
│   ├── backfill_fp2.py            # Backfill FP2 long-run data for 2018+ completed races
│   ├── backfill_all_predictions.py # Recompute GP + sprint predictions for all races (weighted-v3 / sprint-v2)
│   ├── backfill_historical.sh     # Shell loop over sync_schedule/ingest/compute for a year range
│   └── populate_all.sh            # One-time population run for 2021–2025
├── tests/                          # pytest — pure functions directly; DB-touching functions via a fake-db double
│   ├── conftest.py                 # Placeholder DATABASE_URL so importing job modules doesn't need a real .env
│   ├── support/
│   │   └── fake_db.py              # FakeCursor/FakeConnection — scripted RealDictCursor-shaped rows, no real DB
│   ├── test_math_utils.py          # normalize_minmax, softmax, bayesian_win_rate, clamp, weighted_sum
│   ├── test_quality_utils.py       # health_from_issues + resolve_issue_actions
│   ├── test_feature_helpers_pure.py # car_rank, circuit_adj_start_pos
│   ├── test_feature_helpers_db.py  # compute_weather_score, compute_luck_score — via fake_db
│   ├── test_feature_context.py     # build_feature_context, build_driver_code_map — via fake_db
│   ├── test_fastf1_helpers.py      # ms_to_int (the one pure function in fastf1_helpers.py)
│   ├── test_weights.py             # WEIGHTS sum-to-1 + positivity, assemble_scores() key-drift guard,
│   │                                #   both models checked against docs/feature-weights.json
│   ├── test_prediction_ranking.py  # rank_by_probability
│   ├── test_schedule_window.py     # race_weekend_window + RaceWeekendWindow.contains
│   ├── test_auto_runner.py         # run_cycle() schedule gate, decide_next_action, revert-on-failure, poll_interval_for_window
│   └── test_ingest_runner.py       # run_ingest_job + run_qualifying_ingest_job — via fake_db + monkeypatched fastf1_helpers
├── render.yaml                    # Render cron job definitions
├── requirements.txt               # Python dependencies
├── requirements-dev.txt           # requirements.txt + pytest
├── pyproject.toml                 # pytest config (pythonpath, testpaths)
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
| `ingest_fp2` | `--year --round` | Practice long-run stints → `fp2_long_run_times` (FP2 primary, FP1 fallback on sprint weekends); used as primary long-run pace signal |
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
| `feature_manifest.py` | `GP_FEATURES`/`SPRINT_FEATURES: tuple[FeatureSpec, ...]` (name, weight, label, nullable) — the single source for both models' weights; `GP_WEIGHTS`/`SPRINT_WEIGHTS` dicts and `SOFTMAX_TEMPERATURE` derive from it; `assemble_scores(values, features)` raises `KeyError` if a manifest feature's score was never computed. Checked against `docs/feature-weights.json` (also read by `apps/web`'s `predictionMath.test.ts`) so Python and TS weights can't silently drift |
| `math_utils.py` | `normalize_minmax(values)` — min-max to [0,1]; `softmax(scores, temperature=SOFTMAX_TEMPERATURE)` — temperature-scaled; `bayesian_win_rate(wins, races)` — Laplace smoothed; `clamp(value)`; `weighted_sum(scores, weights)` — dot product of a feature-score dict against a model's `WEIGHTS` dict, shared by `compute_features`/`compute_sprint_features` |
| `upsert.py` | `upsert(conn, table, rows, conflict_cols, exclude_update=[])` — idempotent bulk write; `exclude_update` prevents overwriting specified columns (used to protect sprint race data from SQ re-ingest) |
| `feature_helpers.py` | Shared scoring math for GP + sprint models: `compute_weather_score()`, `compute_luck_score()`, `circuit_adj_start_pos()`, `compute_rolling_teammate_delta()` |
| `feature_context.py` | `build_feature_context(conn, race_id, grid_table=..., grid_not_found_message=..., validate_race=None)` — shared query/assembly scaffolding for `compute_features` and `compute_sprint_features`: race+circuit row, grid map, per-driver starting position, driver season stats, team perf/reliability |
| `prediction_runner.py` | `run_prediction_job(...)` — shared softmax/rank/upsert logic for GP + sprint predictions; `rank_by_probability(driver_ids, probabilities)` — pure position-ranking + winner-pick, extracted so it's unit-testable without a DB connection |
| `ingest_runner.py` | Two seams, matched to two different session shapes (see the module docstring for why they're not one). `run_ingest_job(year, round, IngestJobConfig)` — full race/sprint session (weather, SC/VSC, results, lap times, headshots); `IngestJobConfig.mark_status` writes the job's own `races` row, an optional `cross_table_hook` runs after it for effects on other tables (e.g. `ingest_race`'s `circuits.sc_probability` recompute). `run_qualifying_ingest_job(year, round, QualifyingJobConfig)` — qualifying-only session (just quali times, no weather/laps/headshots); `QualifyingJobConfig.rows_from_quali` is the per-job typed `session → rows` function used by `ingest_qualifying`/`ingest_sprint_qualifying` |
| `schedule_window.py` | `race_weekend_window(schedule, now)` → `RaceWeekendWindow \| None` — the current/next GP's window (FP1−1h … race+24h) derived purely from the FastF1 calendar, no DB; `RaceWeekendWindow.contains(now)`. Used by `auto_runner` to gate all DB access and to size the worker's poll interval |

---

## Docs (`docs/`)

| File | Content |
|------|---------|
| `architecture.md` | Monorepo layout, ASCII system diagram, data flow through a race weekend |
| `data-pipeline.md` | Job descriptions, required chain order, cron schedule, local commands, backfill, idempotency |
| `database-schema.md` | Every table with all columns, types, and notes; ER-style relationship diagram |
| `prediction-model.md` | All 12 features with weights, weighted score formula, softmax, data availability by era |
| `rulebased-architecture.md` | Per-feature inventory of the weighted-v3 predictor: source, computation, weight, usage |
| `api-reference.md` | All endpoints with query params, response shapes, error codes |
| `frontend.md` | Astro SSR app — stack, server-only data-fetch rule + 3 exceptions, `components/` vs `features/`, routes, styling, file-size budget |
| `deployment.md` | Env vars for all three platforms, CORS config, first-time setup, local dev |
| `testing.md` | The five suites (pytest, api unit/integration, web vitest, e2e Playwright) — what each covers, how to run, CI jobs |

---

## Claude Skills (`.claude/skills/`)

| Skill | Purpose |
|-------|---------|
| `commit/` | Conventional commit format, domain scopes, and workflow. Always read before committing. |
| `build/` | Build verification runbook |
| `backfill/` | Historical backfill runbook and checklist |
| `performance-check/` | Audits N+1 queries, sequential awaits, per-row ETL loops, missing indexes |
| `codebase-audit/` | Health check against CLAUDE.md critical constraints, schema drift, `any` types |
| `refactor-hunt/` | Finds duplication, especially GP/sprint pipeline drift |
| `codebase-cleanup/` | Removes dead code, unused imports, orphaned migrations |
