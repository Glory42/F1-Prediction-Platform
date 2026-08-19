# apps/ layout is scoped to JS/Bun packages; data-engine and docs stay at repo root

We moved `api/` and `web/` into `apps/api` and `apps/web`, mirroring the Interis monorepo, to get a
unified `bun run dev` and shared root tooling (husky + lint-staged running `tsc --noEmit` per app).
`data-engine/` was deliberately left at the repo root rather than becoming `apps/data-engine`: it's
Python on Render, not a bun-orchestrated process, and it has no "dev server" — its jobs run once and
exit, so it doesn't fit the `apps/` convention or the root `dev` script the way api/web do. `docs/`
also stays at the root rather than moving under `apps/web/docs`, because it's plain reference
content (also read by `CLAUDE.md`, `DECISIONS.md`, and Claude itself), not a standalone deployable
site the way Interis's `apps/docs` (a full Astro Starlight app) is — `web/src/content/config.ts`
just points its content collection `base` at `../../docs`.

## Consequences

Cloudflare's dashboard "root directory" setting for both the Workers project (api) and the Pages
project (web) was pointing at the old `api/`/`web/` paths and had to be updated manually after this
merge — there's no CLI deploy path per `CLAUDE.md`, so this couldn't be scripted. Expect a brief
deploy gap between merge and that manual dashboard update.
