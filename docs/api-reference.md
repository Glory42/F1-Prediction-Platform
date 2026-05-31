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
    "timestamp": "2025-06-01T12:00:00.000Z"
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
    { "id": 26, "year": 2025 }
  ]
}
```

---

## Races

### `GET /api/races?year=N&status=S`

| Param | Required | Default | Notes |
|-------|----------|---------|-------|
| `year` | no | current year | |
| `status` | no | all | `scheduled` \| `qualifying_done` \| `completed` |

Returns all races for the year, each with circuit info.

### `GET /api/races/:id`

Returns a single race with circuit, results (if completed), and prediction (if available).

### `GET /api/races/circuit/:circuitKey`

Returns historical race results at a specific circuit across all years.

---

## Drivers

### `GET /api/drivers?year=N&team_id=T`

| Param | Required | Default | Notes |
|-------|----------|---------|-------|
| `year` | no | current year | |
| `team_id` | no | all teams | Filter by team |

Returns all drivers for the season with their team.

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

## Predictions

### `GET /api/predictions/upcoming`

Returns the prediction for the next scheduled or qualifying-done race. Includes per-driver feature breakdown.

```json
{
  "data": {
    "race": { "id": 200, "name": "Monaco Grand Prix", "raceDate": "2025-05-25", ... },
    "predictedWinner": { "id": 42, "fullName": "Max Verstappen", ... },
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
          "trackOvertake": "0.35000",
          "positionGain": "0.70000"
        }
      }
    ]
  }
}
```

### `GET /api/predictions/race/:raceId`

Returns the prediction for a specific race by ID. Same shape as `/upcoming`.

### `GET /api/predictions/history?year=N`

Returns all predictions for the year with actual results alongside predicted results, for accuracy tracking.

### `GET /api/predictions/standings?year=N`

Returns the "Intelligence Standings" — driver rankings by prediction accuracy (how often each driver was correctly predicted to win or finish in top positions).

---

## Error Codes

| Code | HTTP | Meaning |
|------|------|---------|
| `NOT_FOUND` | 404 | Route doesn't exist |
| `DB_ERROR` | 503 | Database unreachable |
| `INTERNAL_ERROR` | 500 | Unhandled server error |
