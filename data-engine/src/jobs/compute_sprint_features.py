from collections import defaultdict
from src.db.client import get_conn
from src.utils.math_utils import normalize_minmax, bayesian_win_rate, clamp
from src.utils.upsert import upsert

# Sprint races are ~17 laps with no pit stop strategy variance.
# Grid position dominates — overtaking is very hard in such a short race.
# Circuit-context multiplier (same formula as GP) applies to starting position.
WEIGHTS = {
    "car_performance":         0.25,
    "circuit_adj_start_pos":   0.25,
    "short_run_pace":          0.10,
    "driver_rating":           0.10,
    "weather_impact":          0.08,
    "win_rate":                0.08,
    "luck_factor":             0.08,
    "qualifying_delta_sprint": 0.06,
}
# sum = 1.00


def run(race_id: int) -> None:
    print(f"[compute_sprint_features] race_id={race_id}")

    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT r.id, r.season_id, r.sprint_weather, r.weather, r.circuit_id, r.event_format, "
                "       c.overtake_rate, c.sc_probability "
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
        weather = race["sprint_weather"] or race["weather"] or "dry"
        overtake_rate = float(race["overtake_rate"]) if race["overtake_rate"] is not None else 0.5
        sc_probability = float(race["sc_probability"]) if race["sc_probability"] is not None else 0.3

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
                "       dss.sprint_races_entered, dss.sprint_wins, dss.sprint_total_points "
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

        short_run_map  = _compute_short_run_pace(conn, driver_ids, race_id)
        weather_map    = _compute_weather(conn, driver_ids, weather)
        luck_map       = _compute_luck(conn, driver_ids, race_id, team_perf, stats_rows)
        sq_delta_map   = _compute_sq_qualifying_delta(conn, driver_ids, race_id)

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
                sprint_races = sprint_wins = race_races = race_wins = 0
                sprint_pts = race_pts = 0.0

            if sprint_races >= 3:
                driver_rating = clamp(sprint_pts / max(sprint_races, 1) / 8.0)
                win_rate = bayesian_win_rate(sprint_wins, sprint_races)
            else:
                driver_rating = clamp(race_pts / max(race_races, 1) / 25.0)
                win_rate = bayesian_win_rate(race_wins, race_races)

            grid = grid_map.get(driver_id, 20)
            start_pos = (21 - grid) / 20.0

            # Same circuit-context formula as GP model
            circuit_adj_start_pos = clamp(start_pos * (1 + (1 - overtake_rate)) * (1 - 0.3 * sc_probability))

            short_run     = short_run_map.get(driver_id, 0.5)
            weather_score = weather_map.get(driver_id, 0.5)
            luck          = luck_map.get(driver_id, 0.5)
            sq_delta      = sq_delta_map.get(driver_id, 0.5)

            raw = (
                car_perf              * WEIGHTS["car_performance"] +
                circuit_adj_start_pos * WEIGHTS["circuit_adj_start_pos"] +
                short_run             * WEIGHTS["short_run_pace"] +
                driver_rating         * WEIGHTS["driver_rating"] +
                weather_score         * WEIGHTS["weather_impact"] +
                win_rate              * WEIGHTS["win_rate"] +
                luck                  * WEIGHTS["luck_factor"] +
                sq_delta              * WEIGHTS["qualifying_delta_sprint"]
            )

            rows_to_upsert.append({
                "race_id":                    race_id,
                "driver_id":                  driver_id,
                "car_performance_score":      round(car_perf, 5),
                "starting_position_score":    round(start_pos, 5),
                "driver_rating_score":        round(driver_rating, 5),
                "track_overtake_score":       None,
                "short_run_pace_score":       round(short_run, 5),
                "weather_impact_score":       round(weather_score, 5),
                "win_rate_score":             round(win_rate, 5),
                "luck_factor_score":          round(luck, 5),
                "circuit_adj_start_pos_score": round(circuit_adj_start_pos, 5),
                "sq_qualifying_delta_score":  round(sq_delta, 5),
                "raw_weighted_score":         round(raw, 6),
                "win_probability":            0.0,
                "predicted_position":         None,
            })

        upsert(conn, "driver_sprint_features", rows_to_upsert, ["race_id", "driver_id"])
        print(f"  Computed sprint features for {len(rows_to_upsert)} drivers (sprint-v2)")

    finally:
        conn.close()


# ── Feature helpers ────────────────────────────────────────────────────────────

def _compute_short_run_pace(conn, driver_ids, race_id):
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
    normed = normalize_minmax(list(inverted.values()))
    ids = list(inverted.keys())
    result = {ids[i]: normed[i] for i in range(len(ids))}
    return {d: result.get(d, 0.5) for d in driver_ids}


def _compute_sq_qualifying_delta(conn, driver_ids, race_id):
    """
    Rolling weighted mean of SQ teammate delta across the last 5 sprint weekends
    (cross-season via driver.code). Positive = faster than teammate in SQ.
    """
    with conn.cursor() as cur:
        cur.execute("SELECT race_date FROM races WHERE id = %s", (race_id,))
        race_info = cur.fetchone()
    if not race_info:
        return {d: 0.5 for d in driver_ids}

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT sub.driver_id, sub.team_id, sub.best_ms, sub.race_date,
                   ROW_NUMBER() OVER (PARTITION BY sub.driver_id ORDER BY sub.race_date DESC) AS rn
            FROM (
                SELECT d_cur.id AS driver_id, d_hist.team_id,
                       LEAST(NULLIF(sr.sq3_time_ms,0), NULLIF(sr.sq2_time_ms,0), NULLIF(sr.sq1_time_ms,0)) AS best_ms,
                       r.race_date
                FROM drivers d_cur
                JOIN drivers d_hist ON d_hist.code = d_cur.code
                JOIN sprint_results sr ON sr.driver_id = d_hist.id
                JOIN races r ON sr.race_id = r.id
                WHERE d_cur.id = ANY(%s)
                  AND r.race_date <= %s
                  AND r.status IN ('sprint_qualifying_done', 'sprint_done', 'qualifying_done', 'completed')
            ) sub
            WHERE sub.best_ms IS NOT NULL
            """,
            (driver_ids, race_info["race_date"]),
        )
        all_rows = cur.fetchall()

    recent_by_driver: dict[int, list] = defaultdict(list)
    for row in all_rows:
        if row["rn"] <= 5:
            recent_by_driver[row["driver_id"]].append(row)

    if not any(recent_by_driver.values()):
        return {d: 0.5 for d in driver_ids}

    session_team: dict[tuple, list] = defaultdict(list)
    for driver_id, rows in recent_by_driver.items():
        for row in rows:
            key = (str(row["race_date"]), row["team_id"])
            session_team[key].append((driver_id, float(row["best_ms"])))

    weighted_deltas: dict[int, float] = {}
    for driver_id, rows in recent_by_driver.items():
        sorted_rows = sorted(rows, key=lambda r: r["race_date"], reverse=True)
        sum_w, sum_wd = 0.0, 0.0
        for idx, row in enumerate(sorted_rows):
            weight = 5 - idx
            key = (str(row["race_date"]), row["team_id"])
            teammates = [(did, t) for did, t in session_team[key] if did != driver_id]
            if not teammates:
                continue
            best_teammate_ms = min(t for _, t in teammates)
            delta = (best_teammate_ms - float(row["best_ms"])) / best_teammate_ms
            sum_wd += delta * weight
            sum_w += weight
        weighted_deltas[driver_id] = sum_wd / sum_w if sum_w > 0 else 0.0

    vals = [weighted_deltas.get(d, 0.0) for d in driver_ids]
    normalized = normalize_minmax(vals) if len(set(vals)) > 1 else vals
    return {driver_ids[i]: normalized[i] for i in range(len(driver_ids))}


def _compute_weather(conn, driver_ids, weather):
    if weather == "dry":
        return {d: 0.5 for d in driver_ids}

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT d_cur.id AS driver_id,
                   AVG(rr.finish_position) FILTER (WHERE rr.finish_position IS NOT NULL) AS wet_avg,
                   COUNT(*) AS wet_races
            FROM drivers d_cur
            JOIN drivers d_hist ON d_hist.code = d_cur.code
            JOIN race_results rr ON rr.driver_id = d_hist.id
            JOIN races r ON rr.race_id = r.id
            WHERE r.weather IN ('wet', 'mixed') AND d_cur.id = ANY(%s)
            GROUP BY d_cur.id
            """,
            (driver_ids,),
        )
        wet_rows = {r["driver_id"]: r for r in cur.fetchall()}

    raw = []
    for d in driver_ids:
        row = wet_rows.get(d)
        if row and row["wet_races"] and int(row["wet_races"]) >= 1:
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

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT driver_id, grid_position, finish_position FROM (
                SELECT d_cur.id AS driver_id, rr.grid_position, rr.finish_position,
                       ROW_NUMBER() OVER (PARTITION BY d_cur.id ORDER BY r.race_date DESC) AS rn
                FROM drivers d_cur
                JOIN drivers d_hist ON d_hist.code = d_cur.code
                JOIN race_results rr ON rr.driver_id = d_hist.id
                JOIN races r ON rr.race_id = r.id
                WHERE d_cur.id = ANY(%s)
                  AND r.status = 'completed'
                  AND r.race_date < %s
                  AND rr.finish_position IS NOT NULL
            ) t WHERE rn <= 5
            """,
            (driver_ids, race_info["race_date"]),
        )
        driver_results: dict[int, list] = defaultdict(list)
        for row in cur.fetchall():
            driver_results[row["driver_id"]].append(row)

    deltas = {}
    for driver_id in driver_ids:
        team_id = stats_rows.get(driver_id, {}).get("team_id")
        car_rank = _car_rank(team_id, team_perf)
        recent = driver_results[driver_id]
        if not recent:
            deltas[driver_id] = 0.0
            continue
        driver_deltas = [(rr["grid_position"] + car_rank) / 2.0 - rr["finish_position"] for rr in recent]
        deltas[driver_id] = sum(driver_deltas) / len(driver_deltas)

    vals = list(deltas.values())
    normalized = normalize_minmax(vals)
    return {driver_id: normalized[i] for i, driver_id in enumerate(deltas.keys())}


def _car_rank(team_id, team_perf):
    if not team_id:
        return 10.0
    return 20.0 - (team_perf.get(team_id, 0.5) * 19.0)
