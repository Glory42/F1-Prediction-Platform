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
        └── qualifying_results      (FK → drivers)
        └── race_results            (FK → drivers)
        └── lap_times               (FK → drivers)
        └── driver_prediction_features (FK → drivers)
        └── race_predictions        (FK → drivers)
        └── sprint_results          (FK → drivers)  ← sprint weekends only
        └── sprint_lap_times        (FK → drivers)  ← sprint weekends only
        └── driver_sprint_features  (FK → drivers)  ← sprint weekends only
        └── sprint_predictions      (FK → drivers)  ← sprint weekends only
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
| `year` | integer UNIQUE | e.g. 2026 |

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
| `number_of_corners` | integer | null for pre-DRS-era circuits |
| `drs_zones` | integer | null for pre-DRS-era circuits |
| `sc_probability` | numeric(4,3) | Historical SC deployment rate (completed races); null for circuits with no completed races |

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
One row per race event. Sprint weekends have one race row (covering both the sprint and grand prix).

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `season_id` | FK → seasons | |
| `circuit_id` | FK → circuits | |
| `round_number` | integer | |
| `name` | varchar(100) | e.g. `Monaco Grand Prix` |
| `race_date` | date | Grand Prix date |
| `qualifying_date` | date | Saturday qualifying date |
| `sprint_date` | date | Sprint race date (sprint weekends only) |
| `sprint_qualifying_date` | date | SQ session date (sprint weekends only) |
| `event_format` | varchar(30) | `conventional` \| `sprint` \| `sprint_qualifying` \| `sprint_shootout` |
| `status` | varchar(30) | See status flow below |
| `weather` | varchar(30) | `dry` \| `wet` \| `mixed` — main race weather |
| `safety_car_laps` | integer | 2018+ only |
| `vsc_laps` | integer | 2018+ only |
| `air_temp_avg` | numeric(4,1) | 2018+ only |
| `track_temp_avg` | numeric(4,1) | 2018+ only |
| `humidity_avg` | numeric(4,1) | 2018+ only |
| `sprint_weather` | varchar(30) | Sprint-specific weather — sprint weekends only |
| `sprint_safety_car_laps` | integer | Sprint SC laps |
| `sprint_vsc_laps` | integer | Sprint VSC laps |
| `sprint_air_temp_avg` | numeric(4,1) | Sprint session air temp |
| `sprint_track_temp_avg` | numeric(4,1) | Sprint session track temp |
| `sprint_humidity_avg` | numeric(4,1) | Sprint session humidity |
| UNIQUE | `(season_id, round_number)` | |

#### Race Status Flow

```
conventional weekend:
  scheduled → qualifying_done → completed

sprint weekend:
  scheduled → sprint_qualifying_done → sprint_done → qualifying_done → completed
                      ↓                     ↓                ↓
               sprint features      ingest sprint       main qualifying
               sprint predictions   sprint season stats features + predictions
```

---

### `qualifying_results`
One row per driver per main qualifying session.

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
One row per driver per grand prix.

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
One row per lap per driver — 2018+ only.

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
| `stint_number` | integer | Stint index within the race — used for tyre degradation slope |
| UNIQUE | `(race_id, driver_id, lap_number)` | |

---

### `sprint_results`
One row per driver per sprint race. Also stores sprint qualifying (SQ) session times.

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `race_id` | FK → races | |
| `driver_id` | FK → drivers | |
| `finish_position` | integer | Null = DNF/DSQ |
| `grid_position` | integer | Set from SQ result |
| `points` | numeric(4,1) | Sprint points scored |
| `status` | varchar(30) | e.g. `Finished`, `+1 Lap` |
| `total_sprint_time_ms` | bigint | For sprint winner only |
| `fastest_lap` | boolean | |
| `sq1_time_ms` | integer | SQ1 lap time — null if eliminated in SQ1 |
| `sq2_time_ms` | integer | SQ2 lap time — null if not in SQ2 |
| `sq3_time_ms` | integer | SQ3 lap time — null if not in SQ3 |
| `sq_sector1_ms` | integer | Best S1 from SQ session |
| `sq_sector2_ms` | integer | Best S2 from SQ session |
| `sq_sector3_ms` | integer | Best S3 from SQ session |
| `sq_speed_st` | numeric(5,1) | Max speed trap from SQ session |
| UNIQUE | `(race_id, driver_id)` | |

---

### `sprint_lap_times`
Per-lap data for sprint races — mirrors `lap_times` structure. 2018+ only.

| Column | Type | Notes |
|--------|------|-------|
| `id` | bigserial PK | |
| `race_id` | FK → races | |
| `driver_id` | FK → drivers | |
| `lap_number` | integer | |
| `lap_time_ms` | integer | |
| `sector1_ms` | integer | |
| `sector2_ms` | integer | |
| `sector3_ms` | integer | |
| `speed_st` | numeric(5,1) | |
| `compound` | varchar(20) | |
| `tyre_life` | integer | |
| `fresh_tyre` | boolean | |
| `is_pit_lap` | boolean | |
| `stint_number` | integer | Stint index within the sprint |
| UNIQUE | `(race_id, driver_id, lap_number)` | |

---

### `fp2_long_run_times`
FP2 long-run stint data per driver per race. Populated by `ingest_fp2`. 2018+ only.

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `race_id` | FK → races | |
| `driver_id` | FK → drivers | |
| `compound` | varchar(20) | `SOFT`, `MEDIUM`, `HARD` |
| `median_lap_ms` | integer | MEDIUM-normalised median stint lap time (Soft +500ms, Hard −400ms) |
| `stint_length` | integer | Number of laps in the long-run stint (≥5) |
| `fp2_best_lap_ms` | integer | Driver's single fastest raw lap in FP2 |
| UNIQUE | `(race_id, driver_id, compound)` | Best (shortest) stint per compound kept |

---

### `driver_season_stats`
Aggregated after each race via `compute_season_stats`. Includes sprint-specific aggregates.

| Column | Type | Notes |
|--------|------|-------|
| `season_id` | FK → seasons | |
| `driver_id` | FK → drivers | |
| `races_entered` | integer | Grand prix count |
| `wins` | integer | Grand prix wins |
| `podiums` | integer | |
| `poles` | integer | Grid position = 1 |
| `total_points` | numeric | Grand prix points |
| `championship_position` | integer | Ranked by total_points |
| `win_rate` | numeric(5,4) | Bayesian smoothed |
| `avg_position_gain` | numeric(4,2) | grid_position − finish_position avg |
| `dnf_rate` | numeric(4,3) | dnf_count / races_entered |
| `avg_sector1/2/3_ms` | integer | Median — 2018+ only |
| `teammate_quali_delta` | numeric(6,4) | Mean delta vs teammate across season |
| `sprint_races_entered` | integer | Sprint race count |
| `sprint_wins` | integer | |
| `sprint_podiums` | integer | |
| `sprint_total_points` | numeric | Sprint points |
| `sprint_win_rate` | numeric(5,4) | Bayesian smoothed sprint win rate |
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
One row per driver per grand prix race. Written by `compute_features`, updated by `compute_predictions`.

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
| `track_overtake_score` | numeric(6,5) | **Deprecated** — always NULL in weighted-v3; value baked into circuit-adjusted scores |
| `position_gain_score` | numeric(6,5) | Raw avg position gain (kept for display only) |
| `long_run_pace_score` | numeric(6,5) | FP2 primary, historical fallback |
| `reliability_score` | numeric(6,5) | |
| `qualifying_delta_score` | numeric(6,5) | Rolling 5-race weighted teammate delta |
| `sector_strength_score` | numeric(6,5) | |
| `tyre_deg_score` | numeric(6,5) | REGR_SLOPE-derived degradation score — lower slope = higher score |
| `circuit_adj_start_pos_score` | numeric(6,5) | Starting position scaled by overtake_rate × sc_probability |
| `circuit_adj_position_gain_score` | numeric(6,5) | Position gain scaled by overtake_rate |
| `raw_weighted_score` | numeric(8,6) | Weighted sum before softmax |
| `win_probability` | numeric(6,5) | After softmax — sums to 1.0 per race |
| `predicted_position` | integer | 1 = predicted winner |
| UNIQUE | `(race_id, driver_id)` | |

---

### `race_predictions`
One row per grand prix — the single predicted winner.

| Column | Type | Notes |
|--------|------|-------|
| `race_id` | FK → races UNIQUE | |
| `predicted_winner_id` | FK → drivers | |
| `computed_at` | timestamptz | |
| `model_version` | varchar(20) | `weighted-v3` |

---

### `driver_sprint_features`
One row per driver per sprint weekend. Written by `compute_sprint_features`, updated by `compute_sprint_predictions`.

| Column | Type | Notes |
|--------|------|-------|
| `race_id` | FK → races | |
| `driver_id` | FK → drivers | |
| `car_performance_score` | numeric(6,5) | 0–1 |
| `starting_position_score` | numeric(6,5) | Raw SQ grid score (kept for display) |
| `driver_rating_score` | numeric(6,5) | Sprint-specific when ≥3 sprint races recorded |
| `track_overtake_score` | numeric(6,5) | **Deprecated** — always NULL in sprint-v2 |
| `short_run_pace_score` | numeric(6,5) | Best SQ lap time, falls back to main qualifying |
| `weather_impact_score` | numeric(6,5) | Based on sprint_weather field; cross-season |
| `win_rate_score` | numeric(6,5) | Sprint-specific when ≥3 sprint races recorded |
| `luck_factor_score` | numeric(6,5) | Rolling 5-race delta — cross-season |
| `circuit_adj_start_pos_score` | numeric(6,5) | SQ grid scaled by overtake_rate × sc_probability |
| `sq_qualifying_delta_score` | numeric(6,5) | Rolling 5-sprint SQ teammate delta |
| `raw_weighted_score` | numeric(8,6) | |
| `win_probability` | numeric(6,5) | After softmax |
| `predicted_position` | integer | |
| UNIQUE | `(race_id, driver_id)` | |

---

### `sprint_predictions`
One row per sprint weekend — the single predicted sprint winner.

| Column | Type | Notes |
|--------|------|-------|
| `race_id` | FK → races UNIQUE | |
| `predicted_winner_id` | FK → drivers | |
| `computed_at` | timestamptz | |
| `model_version` | varchar(20) | `sprint-v2` |
