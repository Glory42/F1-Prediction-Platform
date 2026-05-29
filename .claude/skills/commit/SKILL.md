---
name: commit
description: Commit code changes with conventional commit messages using F1 Prediction project scopes. Use when the user says "commit", "commit this", "save changes", or "/commit". ALWAYS use this skill for commits — never add Co-Authored-By lines.
---

# Conventional Commit Skill — F1 Prediction

Create git commits following Conventional Commits with project-specific scopes.

## Commit Format

```
<type>(<scope>): <description>

<optional body>
```

## Types

| Type | When to use |
|------|------------|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `refactor` | Code restructuring without behavior change |
| `style` | CSS, Tailwind, visual changes — no logic change |
| `chore` | Build config, dependencies, seed data, tooling |
| `perf` | Performance improvement |
| `data` | ETL jobs, backfill scripts, DB seed, data pipeline |

## Domain Scopes

| Scope | Covers |
|-------|--------|
| `web` | Astro frontend — pages, layouts, components |
| `api` | Hono API — modules, services, controllers, routes |
| `db` | Drizzle schema, migrations, seed |
| `etl` | Python data-engine — ingest, compute, sync jobs |
| `navbar` | Navigation bar, mobile tab bar, car animation |
| `prediction` | Prediction pages, model, standings, compare tool |
| `races` | Race pages, calendar, results table |
| `drivers` | Driver pages, standings, career stats |
| `teams` | Team pages, standings, constructor stats |
| `ui` | Shared components — YearSelect, LapChart, tables |
| `config` | wrangler, astro.config, tsconfig, drizzle.config |

If changes span multiple areas, use the primary one. For broad cross-cutting changes, omit the scope.

## Rules

1. **Description**: lowercase, imperative mood, no period. Max 72 chars.
2. **Body**: recommended for non-trivial commits — explain *why*, not what.
3. **No Co-Authored-By**: Never add co-author lines.
4. **Never deploy**: Do not run `wrangler deploy` or `bun run deploy` — user pushes to GitHub for Cloudflare to pick up.
5. **Scope from diff**: Always read `git diff --staged` to determine the correct scope.
6. **Specific files**: Stage with `git add <specific files>`, never `git add .` or `git add -A`.

## Workflow

1. `git status` — see what changed
2. `git diff --staged` (or `git diff` if nothing staged) — understand the change
3. `git log --oneline -5` — match recent commit style
4. Determine type + scope from diff
5. Stage relevant files: `git add <specific files>`
6. Commit with heredoc:

```bash
git commit -m "$(cat <<'EOF'
type(scope): description

Optional body explaining why.
EOF
)"
```

## Examples

```
feat(prediction): aggregate season-wide features instead of last race only
fix(web): add raceId to RaceResult type so recent results links work
style(navbar): add driving car animation with nav tunnel effect
refactor(api): add /api/seasons endpoint for dynamic year selector
data(etl): backfill 2018-2020 race and qualifying data via FastF1
chore(db): add 2018-2020 seasons and historical circuits to seed
fix(drivers): use per-year driverId in career navigation links
feat(ui): replace hardcoded year buttons with YearSelect dropdown
```
