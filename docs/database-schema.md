# Database Schema

**Provider:** Neon PostgreSQL  
**ORM:** Drizzle  
**Schema source:** `api/src/db/schema/`  
**Migrations:** `db/` (generated SQL files)

---

## Conventions

- All primary keys are `SERIAL` (auto-increment integer)
- All timestamps are `TIMESTAMPTZ DEFAULT now()`
- Lap times stored as `INTEGER` milliseconds — never float
- Feature scores stored as `NUMERIC(6,5)` — range 0.00000 to 1.00000
- All natural keys have `UNIQUE` constraints

---

## Table Overview

```
seasons
  └── teams          (season-scoped)
  └── drivers        (season-scoped, FK → teams)
  └── races          (FK → circuits)
        └── qualifying_results  (FK → drivers)
        └── race_results        (FK → drivers)
        └── lap_times           (FK → drivers)
        └── driver_prediction_features (FK → drivers)
        └── race_predictions    (FK → drivers)
  └── driver_season_stats  (FK → drivers)
  └── team_season_stats    (FK → teams)

circuits   (static, seeded once)
```

---

## Tables

### `seasons`
One row per calendar year.

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `year` | integer UNIQUE | e.g. 2025 |

---

### `circuits`
Static track data, seeded once. Not season-scoped.

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `circuit_key` | varchar(50) UNIQUE | e.g. `monza`, `silverstone` |
| `name` | varchar(100) | |
| `country` | varchar(50) | |
| `city` | varchar(50) | |
| `lap_count` | integer | |
| `track_length_km` | numeric(5,3) | |
| `overtake_rate` | numeric(4,3) | 0.0–1.0; used in prediction model |

---

### `teams`
Season-scoped — a team row exists per year it competed.

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `season_id` | FK → seasons | |
| `team_key` | varchar(50) | snake_case, e.g. `red_bull` |
| `name` | varchar(100) | Display name |
| `nationality` | varchar(50) | |
| UNIQUE | `(season_id, team_key)` | |

---

### `drivers`
Season-scoped — a driver row exists per year they raced.

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `season_id` | FK → seasons | |
| `team_id` | FK → teams | |
| `driver_number` | integer | |
| `code` | char(3) | e.g. `VER`, `HAM` |
| `first_name` | varchar(50) | |
| `last_name` | varchar(50) | |
| `nationality` | varchar(50) | |
| `headshot_url` | varchar(255) | Populated from FastF1 for 2018+ |
| UNIQUE | `(season_id, driver_number)` | |

---

### `races`
One row per race event.

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `season_id` | FK → seasons | |
| `circuit_id` | FK → circuits | |
| `round_number` | integer | |
| `name` | varchar(100) | e.g. `Monaco Grand Prix` |
| `race_date` | date | |
| `status` | enum | `scheduled` \| `qualifying_done` \| `completed` |
| `weather` | varchar(30) | `dry` \| `wet` \| `mixed` |
| `safety_car_laps` | integer | 2018+ only |
| `vsc_laps` | integer | 2018+ only |
| `air_temp_avg` | numeric(4,1) | 2018+ only |
| `track_temp_avg` | numeric(4,1) | 2018+ only |
| `humidity_avg` | numeric(4,1) | 2018+ only |
| UNIQUE | `(season_id, round_number)` | |

---

### `qualifying_results`
One row per driver per race qualifying session.

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `race_id` | FK → races | |
| `driver_id` | FK → drivers | |
| `grid_position` | integer | Final starting grid position |
| `q1_time_ms` | integer | Null if knocked out before Q2 |
| `q2_time_ms` | integer | Null if knocked out before Q3 |
| `q3_time_ms` | integer | Null if not in Q3 |
| `sector1_ms` | integer | Best sector times — 2018+ only |
| `sector2_ms` | integer | |
| `sector3_ms` | integer | |
| `speed_st` | numeric(5,1) | Speed trap km/h — 2018+ only |
| UNIQUE | `(race_id, driver_id)` | |

---

### `race_results`
One row per driver per race.

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `race_id` | FK → races | |
| `driver_id` | FK → drivers | |
| `finish_position` | integer | Null = DNF/DSQ |
| `grid_position` | integer | |
| `points` | numeric(4,1) | Championship points scored |
| `status` | varchar(30) | e.g. `Finished`, `+1 Lap`, `Accident` |
| `total_race_time_ms` | bigint | For winner only |
| `fastest_lap` | boolean | |
| UNIQUE | `(race_id, driver_id)` | |

---

### `lap_times`
One row per lap per driver — 2018+ only (no data from Ergast).

| Column | Type | Notes |
|--------|------|-------|
| `id` | bigserial PK | Large table — bigserial not serial |
| `race_id` | FK → races | |
| `driver_id` | FK → drivers | |
| `lap_number` | integer | |
| `lap_time_ms` | integer | |
| `sector1_ms` | integer | |
| `sector2_ms` | integer | |
| `sector3_ms` | integer | |
| `speed_st` | numeric(5,1) | Speed trap km/h |
| `compound` | varchar(20) | `SOFT`, `MEDIUM`, `HARD`, `INTER`, `WET` |
| `tyre_life` | integer | Laps on current tyre |
| `fresh_tyre` | boolean | |
| `is_pit_lap` | boolean | Excluded from pace calculations |
| UNIQUE | `(race_id, driver_id, lap_number)` | |

---

### `driver_season_stats`
Aggregated after each race via `compute_season_stats`. Used as inputs to `compute_features`.

| Column | Type | Notes |
|--------|------|-------|
| `season_id` | FK → seasons | |
| `driver_id` | FK → drivers | |
| `races_entered` | integer | |
| `wins` | integer | |
| `podiums` | integer | |
| `poles` | integer | Grid position = 1 |
| `total_points` | numeric | |
| `championship_position` | integer | Ranked by total_points |
| `win_rate` | numeric(5,4) | Bayesian smoothed |
| `avg_position_gain` | numeric(4,2) | grid_position − finish_position avg |
| `dnf_rate` | numeric(4,3) | dnf_count / races_entered |
| `avg_sector1/2/3_ms` | integer | Median — 2018+ only |
| `teammate_quali_delta` | numeric(6,4) | Mean delta vs teammate across season |
| UNIQUE | `(season_id, driver_id)` | |

---

### `team_season_stats`
Aggregated after each race. Drives `car_performance_score` in predictions.

| Column | Type | Notes |
|--------|------|-------|
| `season_id` | FK → seasons | |
| `team_id` | FK → teams | |
| `car_performance_score` | numeric(5,4) | Normalized from avg finish position |
| `reliability_score` | numeric(5,4) | Normalized from 1 − dnf_rate |
| `championship_position` | integer | |
| UNIQUE | `(season_id, team_id)` | |

---

### `driver_prediction_features`
One row per driver per race. Written by `compute_features`, updated by `compute_predictions`.

| Column | Type | Notes |
|--------|------|-------|
| `race_id` | FK → races | |
| `driver_id` | FK → drivers | |
| `car_performance_score` | numeric(6,5) | 0–1 |
| `driver_rating_score` | numeric(6,5) | |
| `starting_position_score` | numeric(6,5) | |
| `win_rate_score` | numeric(6,5) | |
| `luck_factor_score` | numeric(6,5) | |
| `weather_impact_score` | numeric(6,5) | |
| `track_overtake_score` | numeric(6,5) | |
| `position_gain_score` | numeric(6,5) | |
| `long_run_pace_score` | numeric(6,5) | |
| `reliability_score` | numeric(6,5) | |
| `qualifying_delta_score` | numeric(6,5) | |
| `sector_strength_score` | numeric(6,5) | |
| `raw_weighted_score` | numeric(8,6) | Weighted sum before softmax |
| `win_probability` | numeric(6,5) | After softmax — sums to 1.0 per race |
| `predicted_position` | integer | 1 = predicted winner |
| UNIQUE | `(race_id, driver_id)` | |

---

### `race_predictions`
One row per race — the single predicted winner.

| Column | Type | Notes |
|--------|------|-------|
| `race_id` | FK → races UNIQUE | |
| `predicted_winner_id` | FK → drivers | |
| `computed_at` | timestamptz | |
| `model_version` | varchar(20) | `weighted-v2` |
