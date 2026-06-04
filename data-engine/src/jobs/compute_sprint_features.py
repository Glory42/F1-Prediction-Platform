from src.db.client import get_conn
from src.utils.math_utils import normalize_minmax, bayesian_win_rate, clamp
from src.utils.upsert import upsert

# Sprint race weights — grid position and car dominate because:
# - no pit stop strategy variance
# - only ~17 laps, very little time to recover
# - track position matters more than raw pace delta
WEIGHTS = {
    "car_performance":    0.25,
    "starting_position":  0.22,
    "track_overtake":     0.12,
    "short_run_pace":     0.10,
    "driver_rating":      0.10,
    "weather_impact":     0.08,
    "win_rate":           0.08,
    "luck_factor":        0.05,
}
# sum = 1.00


def run(race_id: int) -> None:
    print(f"[compute_sprint_features] race_id={race_id}")

    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT r.id, r.season_id, r.sprint_weather, r.weather, r.circuit_id, r.event_format, "
                "       c.overtake_rate "
                "FROM races r JOIN circuits c ON r.circuit_id = c.id "
                "WHERE r.id = %s",
                (race_id,),
            )
            race = cur.fetchone()
        if not race:
            raise ValueError(f"Race {race_id} not found")

        if race["event_format"] not in ("sprint", "sprint_qualifying", "sprint_shootout"):
            raise ValueError(
                f"Race {race_id} has event_format='{race['event_format']}' — "
                "compute_sprint_features only runs on sprint weekends"
            )

        season_id = race["season_id"]
        # Use sprint-specific weather; fall back to main race weather if not yet set
        weather = race["sprint_weather"] or race["weather"] or "dry"
        overtake_rate = float(race["overtake_rate"]) if race["overtake_rate"] is not None else 0.5

        # Grid positions for the sprint come from sprint_results (set by SQ result)
        with conn.cursor() as cur:
            cur.execute(
                "SELECT sr.driver_id, sr.grid_position "
                "FROM sprint_results sr WHERE sr.race_id = %s",
                (race_id,),
            )
            sprint_grid_rows = cur.fetchall()

        if not sprint_grid_rows:
            raise ValueError(f"No sprint results (grid) for race {race_id} — run ingest_sprint first")

        driver_ids = [r["driver_id"] for r in sprint_grid_rows]
        grid_map = {r["driver_id"]: r["grid_position"] for r in sprint_grid_rows}

        with conn.cursor() as cur:
            cur.execute(
                "SELECT dss.driver_id, dss.races_entered, dss.wins, dss.total_points, "
                "       dss.dnf_rate, d.team_id, "
                "       dss.sprint_races_entered, dss.sprint_wins, dss.sprint_total_points, "
                "       dss.sprint_win_rate "
                "FROM driver_season_stats dss "
                "JOIN drivers d ON dss.driver_id = d.id "
                "WHERE dss.season_id = %s AND dss.driver_id = ANY(%s)",
                (season_id, driver_ids),
            )
            stats_rows = {r["driver_id"]: r for r in cur.fetchall()}

        with conn.cursor() as cur:
            cur.execute(
                "SELECT t.id AS team_id, tss.car_performance_score "
                "FROM team_season_stats tss JOIN teams t ON tss.team_id = t.id "
                "WHERE tss.season_id = %s",
                (season_id,),
            )
            team_perf = {
                r["team_id"]: float(r["car_performance_score"]) if r["car_performance_score"] else 0.5
                for r in cur.fetchall()
            }

        short_run_map = _compute_short_run_pace(conn, driver_ids, race_id)
        weather_map   = _compute_weather(conn, driver_ids, weather)
        luck_map      = _compute_luck(conn, driver_ids, race_id, team_perf, stats_rows)

        rows_to_upsert = []
        for driver_id in driver_ids:
            stat = stats_rows.get(driver_id)
            team_id = stat["team_id"] if stat else None

            car_perf = team_perf.get(team_id, 0.5) if team_id else 0.5

            if stat:
                sprint_races = int(stat["sprint_races_entered"] or 0)
                sprint_wins  = int(stat["sprint_wins"] or 0)
                sprint_pts   = float(stat["sprint_total_points"] or 0.0)
                race_races   = int(stat["races_entered"])
                race_wins    = int(stat["wins"])
                race_pts     = float(stat["total_points"])
            else:
                sprint_races = sprint_wins = sprint_pts = 0
                race_races = race_wins = race_pts = 0.0

            # Use sprint-specific history when ≥3 sprint races recorded;
            # otherwise fall back to main race stats (scaled to sprint's max 8 pts vs 25)
            if sprint_races >= 3:
                driver_rating = clamp(sprint_pts / max(sprint_races, 1) / 8.0)
                win_rate = bayesian_win_rate(sprint_wins, sprint_races)
            else:
                driver_rating = clamp(race_pts / max(race_races, 1) / 25.0)
                win_rate = bayesian_win_rate(race_wins, race_races)
            grid = grid_map.get(driver_id, 20)
            start_pos = (21 - grid) / 20.0

            short_run    = short_run_map.get(driver_id, 0.5)
            weather_score = weather_map.get(driver_id, 0.5)
            luck         = luck_map.get(driver_id, 0.5)

            raw = (
                car_perf        * WEIGHTS["car_performance"] +
                start_pos       * WEIGHTS["starting_position"] +
                overtake_rate   * WEIGHTS["track_overtake"] +
                short_run       * WEIGHTS["short_run_pace"] +
                driver_rating   * WEIGHTS["driver_rating"] +
                weather_score   * WEIGHTS["weather_impact"] +
                win_rate        * WEIGHTS["win_rate"] +
                luck            * WEIGHTS["luck_factor"]
            )

            rows_to_upsert.append({
                "race_id": race_id,
                "driver_id": driver_id,
                "car_performance_score":    round(car_perf, 5),
                "starting_position_score":  round(start_pos, 5),
                "driver_rating_score":      round(driver_rating, 5),
                "track_overtake_score":     round(overtake_rate, 5),
                "short_run_pace_score":     round(short_run, 5),
                "weather_impact_score":     round(weather_score, 5),
                "win_rate_score":           round(win_rate, 5),
                "luck_factor_score":        round(luck, 5),
                "raw_weighted_score":       round(raw, 6),
                "win_probability":          0.0,
                "predicted_position":       None,
            })

        upsert(conn, "driver_sprint_features", rows_to_upsert, ["race_id", "driver_id"])
        print(f"  Computed sprint features for {len(rows_to_upsert)} drivers")

    finally:
        conn.close()


# ── Feature helpers ────────────────────────────────────────────────────────────

def _compute_short_run_pace(conn, driver_ids: list[int], race_id: int) -> dict[int, float]:
    """
    Best SQ lap time from sprint_results (sq1/sq2/sq3_time_ms).
    Falls back to main qualifying times if SQ times are not available.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT sr.driver_id,
                   LEAST(NULLIF(sr.sq3_time_ms,0), NULLIF(sr.sq2_time_ms,0), NULLIF(sr.sq1_time_ms,0)) AS best_ms
            FROM sprint_results sr
            WHERE sr.race_id = %s AND sr.driver_id = ANY(%s)
            """,
            (race_id, driver_ids),
        )
        rows = {r["driver_id"]: r["best_ms"] for r in cur.fetchall()}

    # Fall back to main qualifying if SQ times not ingested yet
    if not any(v for v in rows.values()):
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT qr.driver_id,
                       LEAST(NULLIF(qr.q3_time_ms,0), NULLIF(qr.q2_time_ms,0), NULLIF(qr.q1_time_ms,0)) AS best_ms
                FROM qualifying_results qr
                WHERE qr.race_id = %s AND qr.driver_id = ANY(%s)
                """,
                (race_id, driver_ids),
            )
            rows = {r["driver_id"]: r["best_ms"] for r in cur.fetchall()}

    if not rows or not any(v for v in rows.values()):
        return {d: 0.5 for d in driver_ids}

    pairs = [(d, float(rows[d])) for d in driver_ids if d in rows and rows[d]]
    if not pairs:
        return {d: 0.5 for d in driver_ids}

    max_t = max(t for _, t in pairs)
    inverted = {did: max_t - t for did, t in pairs}
    vals = list(inverted.values())
    normed = normalize_minmax(vals)
    ids = list(inverted.keys())
    result = {ids[i]: normed[i] for i in range(len(ids))}
    return {d: result.get(d, 0.5) for d in driver_ids}


def _compute_weather(conn, driver_ids: list[int], weather: str) -> dict[int, float]:
    if weather == "dry":
        return {d: 0.5 for d in driver_ids}

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT rr.driver_id,
                   AVG(rr.finish_position) FILTER (WHERE rr.finish_position IS NOT NULL) AS wet_avg,
                   COUNT(*) AS wet_races
            FROM race_results rr
            JOIN races r ON rr.race_id = r.id
            WHERE r.weather IN ('wet', 'mixed') AND rr.driver_id = ANY(%s)
            GROUP BY rr.driver_id
            """,
            (driver_ids,),
        )
        wet_rows = {r["driver_id"]: r for r in cur.fetchall()}

    raw = []
    for d in driver_ids:
        row = wet_rows.get(d)
        if row and row["wet_races"] and int(row["wet_races"]) >= 3:
            raw.append(21.0 - float(row["wet_avg"]))
        else:
            raw.append(None)

    valid = [s for s in raw if s is not None]
    field_avg = sum(valid) / len(valid) if valid else 10.5
    filled = [s if s is not None else field_avg for s in raw]
    normalized = normalize_minmax(filled)
    return {driver_ids[i]: normalized[i] for i in range(len(driver_ids))}


def _compute_luck(conn, driver_ids, race_id, team_perf, stats_rows):
    with conn.cursor() as cur:
        cur.execute("SELECT race_date FROM races WHERE id = %s", (race_id,))
        race_info = cur.fetchone()

    if not race_info:
        return {d: 0.5 for d in driver_ids}

    deltas = {}
    for driver_id in driver_ids:
        team_id = stats_rows.get(driver_id, {}).get("team_id")
        car_rank = _car_rank(team_id, team_perf)

        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT rr.grid_position, rr.finish_position
                FROM race_results rr
                JOIN races r ON rr.race_id = r.id
                WHERE rr.driver_id = %s
                  AND r.status = 'completed'
                  AND r.race_date < %s
                  AND rr.finish_position IS NOT NULL
                ORDER BY r.race_date DESC
                LIMIT 5
                """,
                (driver_id, race_info["race_date"]),
            )
            recent = cur.fetchall()

        if not recent:
            deltas[driver_id] = 0.0
            continue

        driver_deltas = []
        for rr in recent:
            expected = (rr["grid_position"] + car_rank) / 2.0
            driver_deltas.append(expected - rr["finish_position"])
        deltas[driver_id] = sum(driver_deltas) / len(driver_deltas)

    vals = list(deltas.values())
    normalized = normalize_minmax(vals)
    return {driver_id: normalized[i] for i, driver_id in enumerate(deltas.keys())}


def _car_rank(team_id, team_perf):
    if not team_id:
        return 10.0
    score = team_perf.get(team_id, 0.5)
    return 20.0 - (score * 19.0)
