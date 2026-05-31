# Prediction Model

## Overview

Predictions are computed per-race after qualifying. Each driver gets a score built from 12 weighted features. Scores are passed through a softmax to produce win probabilities, which are then ranked into predicted finishing positions.

---

## Race Status Flow

```
scheduled  ──→  qualifying_done  ──→  completed
                     │                    │
            compute_features        ingest_race
            compute_predictions     compute_season_stats
```

Predictions are computed at `qualifying_done`. Results are ingested at `completed`. A race must be `qualifying_done` (have qualifying data) before features can be computed.

---

## The 12 Features

| Feature | Weight | Source |
|---------|--------|--------|
| Car Performance | 22% | `team_season_stats.car_performance_score` — normalized avg finish position across the field |
| Long Run Pace | 12% | Median clean lap time at same circuit across last 6 visits, normalized |
| Starting Position | 12% | `qualifying_results.grid_position` — inverted so P1 = 1.0 |
| Driver Rating | 10% | `driver_season_stats.total_points / races_entered / 25` — capped at 1.0 |
| Win Rate | 10% | Bayesian-smoothed: `(wins + 0.5) / (races + 2)` |
| Reliability | 8% | Blend: team reliability score (70%) + driver personal DNF rate (30%) |
| Luck Factor | 8% | Rolling 5-race delta between actual finish and expected finish (from car rank + grid) |
| Sector Strength | 6% | Best sector time advantage vs field in qualifying, averaged across S1/S2/S3 |
| Qualifying Delta | 5% | How much faster/slower vs teammate in this qualifying session |
| Weather Impact | 3% | Historical avg wet-race finish position; neutral (0.5) for dry races |
| Track Overtake Rate | 2% | `circuits.overtake_rate` — static per circuit, affects luck upside |
| Position Gain Rate | 2% | `driver_season_stats.avg_position_gain` — avg positions gained per race |

All feature scores are normalized to [0.0, 1.0] using min-max normalization across the driver field for that race.

---

## Weighted Score

```python
raw = (
    car_perf          * 0.22 +
    long_run          * 0.12 +
    start_pos         * 0.12 +
    driver_rating     * 0.10 +
    win_rate          * 0.10 +
    reliability       * 0.08 +
    luck              * 0.08 +
    sector_strength   * 0.06 +
    quali_delta       * 0.05 +
    weather_score     * 0.03 +
    track_overtake    * 0.02 +
    position_gain     * 0.02
)
```

---

## Softmax → Win Probability

```python
exp_s = np.exp(scores / T)
win_probability = exp_s / exp_s.sum()
```

Temperature `T = 0.3`. Lower temperature makes the model more decisive — small score differences produce larger probability gaps. Do not increase T.

Probabilities sum to 1.0 across all drivers in a race.

---

## Predicted Position

Drivers are ranked by `win_probability` descending. Rank 1 = predicted winner, stored in `race_predictions.predicted_winner_id`. All driver positions are stored in `driver_prediction_features.predicted_position`.

---

## Data Availability by Era

| Years | Qualifying data | Lap times | Notes |
|-------|----------------|-----------|-------|
| 2018–2025 | Full Q1/Q2/Q3 + sector times | Full per-lap telemetry | FastF1 timing API |
| 2006–2017 | Q1/Q2/Q3 times | None | FastF1 via Ergast |
| 2000–2005 | Single best lap time only | None | FastF1 via Ergast; sparse coverage |

For races without qualifying data, `compute_features` cannot run — those races have no predictions.
