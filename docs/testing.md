---
title: "Testing"
description: "The five test suites — what each covers, how to run it, and how they run in CI"
order: 7
---

# Testing

Five suites, one per runtime boundary. Each app owns its own runner and config — there is no
top-level test command.

| Suite | Location | Runner | Touches a real DB? |
|---|---|---|---|
| Data engine | `data-engine/tests/` | pytest | No — scripted fake DB |
| API unit | `apps/api/tests/unit/` | `bun test` | No |
| API integration | `apps/api/tests/integration/` | `bun test` | Yes — dedicated Neon branch |
| Web unit | `apps/web/tests/unit/` | Vitest | No — MSW mocks the API |
| Web e2e | `apps/e2e/tests/smoke/` | Playwright | No — fixture API server |

**Test files are never co-located with source.** They live under the app's `tests/` directory (or
`apps/e2e/tests/`), mirroring the path of the file under test — e.g. `tests/unit/common/mappers.test.ts`
covers `src/common/mappers.ts`.

## Running everything

```bash
# data-engine
cd data-engine && pytest -v

# api  (needs TEST_DATABASE_URL in apps/api/.env for the integration suite)
cd apps/api && bun test              # unit + integration
cd apps/api && bun run test:unit     # unit only
cd apps/api && bun run test:integration

# web
cd apps/web && bun run test          # vitest run

# e2e  (spins up its own servers)
cd apps/e2e && bun run test
```

## Data engine (`data-engine/tests/`)

pytest, config in `pyproject.toml` (`pythonpath = ["."]`, `testpaths = ["tests"]`). Dev deps:
`requirements-dev.txt` (= `requirements.txt` + `pytest`).

- **Pure functions are tested directly** — `math_utils.py` (`normalize_minmax`, `softmax`,
  `bayesian_win_rate`, …), pure `feature_helpers.py` helpers, the model `WEIGHTS` invariants
  (`test_weights.py` — sum-to-1 and positivity for both models), `rank_by_probability`,
  `race_weekend_window`.
- **DB-touching functions are tested through a fake double** — `tests/support/fake_db.py` provides
  `FakeCursor` / `FakeConnection`, shaped like psycopg2's `RealDictCursor`. `FakeConnection` takes a
  list of result sets and hands one out per `with conn.cursor()` block, in call order. This covers
  `compute_weather_score`, `compute_luck_score`, `build_feature_context`, `build_driver_code_map`, and
  `ingest_runner.py`'s two shared runners (`run_ingest_job`, `run_qualifying_ingest_job`) — the latter via
  monkeypatched per-job callables and FastF1 helpers, no real session data needed.
- `conftest.py` sets a placeholder `DATABASE_URL` so importing a job module (which reads it at import
  time) works with or without a local `.env`. Tests never open a real connection.
- Still untested: deeper ETL orchestration (`upsert.py`, `prediction_runner.py`).

## API unit (`apps/api/tests/unit/`)

`bun test`, no DB, no network. Mirrors `src/` by domain — mostly the shared `src/common/` transform
layer (`mappers`, `collections`, `standings`, `prediction-response`, `prediction-history`,
`accuracy`, `cache`) plus module-local pure helpers (`modules/predictions/intel-standings.helpers`,
`modules/quality`). Fixtures are plain objects typed as `typeof <table>.$inferSelect`; see
`prediction-response.test.ts` for the pattern.

Anything pure that a service delegates to — row→DTO mapping, aggregation, normalisation — belongs
here. If a service method is hard to unit-test, that's usually a sign the pure part should be
extracted into `common/` or a `*.helpers.ts` (this is what the `max-lines` budget nudges toward).

## API integration (`apps/api/tests/integration/`)

`bun test` driving the real Hono app in-process via `app.request()` against a **dedicated Neon test
branch**.

- **`TEST_DATABASE_URL`** (in `apps/api/.env`, see `.env.example`) — a distinct env var from
  `DATABASE_URL`. `tests/support/db/test-db.ts` refuses to truncate if the two are equal
  (override with `TEST_DB_ALLOW_RESET=1`). Missing `TEST_DATABASE_URL` throws with instructions.
- **`tests/support/app/request.ts`** — `apiRequest(path, init?)` calls `app.request()` with a
  `Bindings` env pointing at the test DB.
- **`tests/support/factories/`** — one insert helper per table, each taking `Partial<$inferInsert>`
  overrides and returning the inserted row. FK chain: `season → team/circuit → driver → race →
  results/predictions`.
- **Lifecycle** — each test file calls `truncateAll(db)` in `beforeAll` and `afterAll`, seeds its
  own fixtures (typically under a sentinel year like `2097`/`2099`), and asserts on the JSON
  response. `truncateAll` is a single `TRUNCATE … RESTART IDENTITY CASCADE` over every table.
- **Covered**: `races`, `drivers`, `teams`, `seasons`, `search`. Not yet: `predictions`, `sprint`,
  `quality`.

## Web unit (`apps/web/tests/unit/`)

Vitest, config in `vitest.config.ts` (include `tests/unit/**/*.test.{ts,tsx}`, `@` alias, setup file).

- **Default environment is `node`** — pure logic runs there: `lib/predictionMath.ts` (all exports),
  `lib/teamColors` / `lib/teamLogos`, `features/compare/compareStats.ts`.
- **jsdom is opt-in per file** via a `// @vitest-environment jsdom` docblock on line 1 — used for
  hook/component tests (`useCompareController`, `useGlobalSearch`, `GlobalSearch`) with Testing
  Library.
- **`tests/support/setup.ts`** — jest-dom matchers, a `ResizeObserver` stub (cmdk needs it), and the
  MSW server lifecycle (`onUnhandledRequest: 'error'`, reset between tests).
- **`tests/support/msw/`** — `handlers.ts` + `fixtures.ts` mock the `src/lib/api.ts` endpoints at
  `http://localhost:8787`. Client-side fetches in the components under test hit these.
- Not covered: `.astro` component rendering.

## Web e2e (`apps/e2e/`)

Playwright, its own `package.json` and `playwright.config.ts` (see
`docs/adr/0001-apps-layout-scoped-to-js-bun.md` for why it isn't nested under `apps/web/`).

- `webServer` starts two processes: the **fixture API server** (`fixtures/server.ts`, `Bun.serve`
  on `:4310`, serves `{ data, error: null }` + CORS headers for the routes under test) and
  **`astro dev`** for `apps/web` on `:4321` with `PUBLIC_API_URL` pointed at the fixture server.
- `astro preview` isn't used — the `@astrojs/cloudflare` adapter doesn't support it — so the SSR
  frontmatter runs under Vite's dev server instead. Playwright can't intercept the server-side
  fetches Astro makes in frontmatter, which is why a real fixture HTTP server is needed rather than
  request mocking.
- The fixture server sends CORS headers because `GlobalSearch` / `DriverCompareTool` /
  `TeamCompareTool` fetch client-side — a genuine cross-origin browser request. Every other route is
  only ever hit server-side.
- Smoke specs cover `/prediction`, `/races/[id]`, `/drivers/[id]`, `/teams/[id]`,
  `/drivers/compare`, and the global search palette — each asserts key content renders and no
  "failed to load" appears.

## CI (`.github/workflows/test.yml`)

Four jobs, on every push to `master` and every PR:

| Job | Steps |
|---|---|
| `data-engine` | `pip install -r requirements-dev.txt` → `pytest -v` |
| `api` | `bun install` → `db:migrate` (if `DATABASE_URL` secret set) → `bun test` → `bun run typecheck` → `bun run lint` |
| `web` | `bun install` → `bun run build` → `bun run test` → `bun run typecheck` → `bun run lint` |
| `e2e` | `bun install` (web + e2e) → `playwright install chromium` → `bun run test` |

The `api` job runs the integration suite against `secrets.TEST_DATABASE_URL`; if that secret is
absent the suite still runs but integration files fail fast on the missing-env guard.

## Adding a test

- **Pure helper (either app)** → `tests/unit/`, mirror the source path. Prefer extracting the pure
  part over testing a DB-bound method.
- **New API endpoint / query** → an integration file under `tests/integration/<domain>/`; add a
  factory if a table has none; `truncateAll` in `beforeAll`/`afterAll`.
- **New interactive web island** → a `jsdom` Vitest file; add MSW handlers for any endpoint it
  calls; consider an e2e smoke spec + a fixture route if it's a whole page.
- **New ETL scoring function** → pytest; pure if possible, otherwise script `FakeConnection` with
  one result set per query the function issues.
