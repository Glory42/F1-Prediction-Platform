---
title: "API Reference"
description: "All REST endpoints, request parameters, and response shapes"
order: 5
---

# API Reference

**Base URL:** `https://f1-intelligence-api.gorkemkaryol.workers.dev`  
**Local dev:** `http://localhost:8787`

All responses follow this envelope:

```json
{ "data": <T>, "error": null }
{ "data": null, "error": { "code": "ERROR_CODE", "message": "..." } }
```

No authentication. All endpoints are read-only GET.

---

## Health

### `GET /api/health`

Checks API and DB connectivity.

```json
{
  "data": {
    "status": "ok",
    "db": "connected",
    "timestamp": "2026-06-04T12:00:00.000Z"
  }
}
```

---

## Seasons

### `GET /api/seasons`

Returns all seasons with data.

```json
{
  "data": [
    { "id": 1, "year": 2000 },
    { "id": 27, "year": 2026 }
  ]
}
```

---

## Races

### `GET /api/races?year=N&status=S`

| Param | Required | Default | Notes |
|-------|----------|---------|-------|
| `year` | no | current year | |
| `status` | no | all | `scheduled` \| `sprint_qualifying_done` \| `sprint_done` \| `qualifying_done` \| `completed` |

Returns all races for the year. Each race includes `eventFormat`, `hasSprint`, `sprintDate`, and sprint condition fields for sprint weekends.

### `GET /api/races/:id`

Returns a single race with circuit, results (if completed), qualifying, and lap summaries.

The `Race` object includes:
- `eventFormat` — `conventional` | `sprint` | `sprint_qualifying` | `sprint_shootout`
- `hasSprint` — boolean derived from eventFormat
- `sprintDate` / `sprintQualifyingDate` — ISO strings, null for conventional weekends
- `sprintWeather`, `sprintSafetyCarLaps`, `sprintVscLaps`, `sprintAirTempAvg`, `sprintTrackTempAvg`, `sprintHumidityAvg` — sprint-specific conditions

### `GET /api/races/circuit/:circuitKey`

Returns historical race results at a specific circuit across all years. Each item includes `hasSprint: boolean`.

---

## Drivers

### `GET /api/drivers?year=N&team_id=T`

| Param | Required | Default | Notes |
|-------|----------|---------|-------|
| `year` | no | current year | |
| `team_id` | no | all teams | Filter by team |

### `GET /api/drivers/standings?year=N`

Returns driver championship standings for the year, ordered by points.

### `GET /api/drivers/:id?year=N`

Returns a single driver with their season stats for the given year.

### `GET /api/drivers/:id/career`

Returns a driver's stats across all seasons they have data in.

---

## Teams

### `GET /api/teams?year=N`

Returns all teams for the season.

### `GET /api/teams/standings?year=N`

Returns constructor championship standings for the year, ordered by points.

### `GET /api/teams/:id?year=N`

Returns a single team with season stats for the given year.

### `GET /api/teams/:id/career`

Returns a team's stats across all seasons they have data in.

---

## Predictions (Grand Prix)

### `GET /api/predictions/model-info`

Returns the most recently computed model versions for GP and sprint predictions. Updates automatically whenever `compute_predictions` or `compute_sprint_predictions` runs — no deploy needed.

```json
{
  "data": {
    "gpVersion": "weighted-v3",
    "sprintVersion": "sprint-v2"
  }
}
```

---

### `GET /api/predictions/upcoming`

Returns the prediction for the next `qualifying_done` race with `race_date >= today`. Ordered ascending so the chronologically next race always wins — historical races stuck in `qualifying_done` from a partial backfill are excluded by the date guard.

```json
{
  "data": {
    "race": { "id": 200, "name": "Monaco Grand Prix", "raceDate": "2026-06-07", "hasSprint": false, ... },
    "predictedWinner": { "id": 42, "fullName": "Max Verstappen", ... },
    "modelVersion": "weighted-v2",
    "drivers": [
      {
        "predictedPosition": 1,
        "winProbability": "0.28500",
        "driver": { "id": 42, "code": "VER", "fullName": "Max Verstappen", "team": { ... } },
        "features": {
          "carPerformance": "0.91200",
          "driverRating": "0.88000",
          "startingPosition": "1.00000",
          "winRate": "0.77000",
          "luckFactor": "0.62000",
          "weatherImpact": "0.50000",
          "trackOvertake": null,
          "positionGain": "0.70000",
          "longRunPace": "0.81000",
          "reliability": "0.90000",
          "qualifyingDelta": "0.68000",
          "sectorStrength": "0.74000"
        }
      }
    ]
  }
}
```

### `GET /api/predictions/race/:raceId`

Returns the prediction for a specific grand prix by race ID. Same shape as `/upcoming`.

### `GET /api/predictions/history?year=N`

Returns all predictions for the year — both grand prix and sprint races merged and sorted by date descending. Includes actual results alongside predicted results for accuracy tracking.

Each item includes `isSprint: boolean`. Sprint items link to `/races/:id/sprint`; main race items link to `/prediction/:id`.

```json
{
  "data": [
    {
      "raceId": 210,
      "raceName": "Canadian Grand Prix",
      "raceDate": "2026-05-24",
      "roundNumber": 5,
      "isSprint": false,
      "predictedWinner": { "code": "ANT", ... },
      "actualWinner": { "code": "ANT", ... },
      "correct": true,
      "winProbability": "0.31200",
      "computedAt": "2026-05-23T20:00:00.000Z"
    },
    {
      "raceId": 205,
      "raceName": "Chinese Grand Prix",
      "raceDate": "2026-03-15",
      "roundNumber": 2,
      "isSprint": true,
      "predictedWinner": { "code": "ANT", ... },
      "actualWinner": { "code": "RUS", ... },
      "correct": false,
      "winProbability": "0.29000",
      "computedAt": "2026-03-14T18:00:00.000Z"
    }
  ]
}
```

### `GET /api/predictions/standings?year=N`

Returns the "Intelligence Standings" — driver rankings by average prediction score. Each row includes sprint aggregates (`sprintWins`, `sprintPodiums`, `sprintTotalPoints`).

---

## Sprint Predictions

### `GET /api/sprint/upcoming`

Returns the sprint prediction for the next upcoming sprint weekend. Same envelope as the grand prix upcoming prediction but uses sprint model features and `modelVersion: "sprint-v1"`.

### `GET /api/sprint/race/:raceId`

Returns the sprint prediction for a specific race ID. Includes sprint results if the sprint has been completed, and sprint lap summaries.

```json
{
  "data": {
    "race": { "id": 205, "name": "Chinese Grand Prix", "hasSprint": true, "sprintDate": "2026-03-15", ... },
    "prediction": {
      "predictedWinner": { "code": "ANT", ... },
      "modelVersion": "sprint-v1",
      "drivers": [
        {
          "predictedPosition": 1,
          "winProbability": "0.29000",
          "driver": { ... },
          "features": {
            "carPerformance": "0.88000",
            "startingPosition": "1.00000",
            "driverRating": "0.75000",
            "trackOvertake": "0.42000",
            "shortRunPace": "0.91000",
            "weatherImpact": "0.50000",
            "winRate": "0.65000",
            "luckFactor": "0.55000"
          }
        }
      ]
    },
    "results": [ ... ],
    "laps": [ ... ]
  }
}
```

---

## Error Codes

| Code | HTTP | Meaning |
|------|------|---------|
| `NOT_FOUND` | 404 | Route doesn't exist |
| `DB_ERROR` | 503 | Database unreachable |
| `INTERNAL_ERROR` | 500 | Unhandled server error |
