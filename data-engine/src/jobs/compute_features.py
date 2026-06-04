from collections import defaultdict
from src.db.client import get_conn
from src.utils.math_utils import normalize_minmax, bayesian_win_rate, clamp
from src.utils.upsert import upsert


WEIGHTS = {
    "car_performance":            0.20,
    "long_run_pace":              0.15,
    "tyre_degradation":           0.08,
    "reliability":                0.08,
    "qualifying_delta":           0.08,
    "driver_rating":              0.08,
    "win_rate":                   0.08,
    "luck_factor":                0.07,
    "sector_strength":            0.06,
    "circuit_adj_start_pos":      0.07,
    "circuit_adj_position_gain":  0.03,
    "weather_impact":             0.02,
}
# sum = 1.00


def run(race_id: int) -> None:
    print(f"[compute_features] race_id={race_id}")

    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT r.id, r.season_id, r.weather, r.circuit_id, "
                "       c.overtake_rate, c.sc_probability "
                "FROM races r JOIN circuits c ON r.circuit_id = c.id "
                "WHERE r.id = %s",
                (race_id,),
            )
            race = cur.fetchone()
        if not race:
            raise ValueError(f"Race {race_id} not found")

        season_id = race["season_id"]
        weather = race["weather"] or "dry"
        overtake_rate = float(race["overtake_rate"]) if race["overtake_rate"] is not None else 0.5
        sc_probability = float(race["sc_probability"]) if race["sc_probability"] is not None else 0.3

        with conn.cursor() as cur:
            cur.execute(
                "SELECT qr.driver_id, qr.grid_position "
                "FROM qualifying_results qr WHERE qr.race_id = %s",
                (race_id,),
            )
            quali_rows = cur.fetchall()

        if not quali_rows:
            raise ValueError(f"No qualifying results for race {race_id}")

        driver_ids = [r["driver_id"] for r in quali_rows]
        grid_map = {r["driver_id"]: r["grid_position"] for r in quali_rows}

        with conn.cursor() as cur:
            cur.execute(
                "SELECT dss.driver_id, dss.races_entered, dss.wins, dss.total_points, "
                "       dss.avg_position_gain, dss.dnf_rate, dss.teammate_quali_delta, d.team_id "
                "FROM driver_season_stats dss "
                "JOIN drivers d ON dss.driver_id = d.id "
                "WHERE dss.season_id = %s AND dss.driver_id = ANY(%s)",
                (season_id, driver_ids),
            )
            stats_rows = {r["driver_id"]: r for r in cur.fetchall()}

        with conn.cursor() as cur:
            cur.execute(
                "SELECT t.id AS team_id, tss.car_performance_score, tss.reliability_score "
                "FROM team_season_stats tss JOIN teams t ON tss.team_id = t.id "
                "WHERE tss.season_id = %s",
                (season_id,),
            )
            team_data = {
                r["team_id"]: {
                    "car_perf": float(r["car_performance_score"]) if r["car_performance_score"] else 0.5,
                    "reliability": float(r["reliability_score"]) if r["reliability_score"] else 0.5,
                }
                for r in cur.fetchall()
            }

        team_perf = {tid: v["car_perf"] for tid, v in team_data.items()}

        luck_map        = _compute_luck(conn, driver_ids, race_id, team_perf, stats_rows)
        weather_map     = _compute_weather(conn, driver_ids, weather)
        long_run_map    = _compute_long_run_pace(conn, driver_ids, race_id, race["circuit_id"])
        reliability_map = _compute_reliability(driver_ids, stats_rows, team_data)
        quali_delta_map = _compute_qualifying_delta(conn, driver_ids, race_id)
        sector_map      = _compute_sector_strength(conn, driver_ids, race_id)
        tyre_deg_map    = _compute_tyre_degradation(conn, driver_ids, race_id, race["circuit_id"])

        rows_to_upsert = []
        for driver_id in driver_ids:
            stat = stats_rows.get(driver_id)
            team_id = stat["team_id"] if stat else None
            car_perf = team_perf.get(team_id, 0.5) if team_id else 0.5

            if stat:
                races_entered = int(stat["races_entered"])
                wins = int(stat["wins"])
                pts = float(stat["total_points"])
                avg_gain = float(stat["avg_position_gain"]) if stat["avg_position_gain"] is not None else 0.0
            else:
                races_entered, wins, pts, avg_gain = 0, 0, 0.0, 0.0

            driver_rating = clamp(pts / max(races_entered, 1) / 25.0)
            win_rate = bayesian_win_rate(wins, races_entered)

            grid = grid_map.get(driver_id, 20)
            start_pos = (21 - grid) / 20.0
            position_gain = clamp((avg_gain + 15.0) / 30.0)

            # Circuit-context multipliers:
            # Starting position matters more at low-overtake tracks (Monaco) and less at high (Monza).
            # SC probability reduces grid advantage further — high-SC circuits bunch the field.
            circuit_adj_start_pos = clamp(start_pos * (1 + (1 - overtake_rate)) * (1 - 0.3 * sc_probability))
            # Position gain potential is only meaningful where overtaking is physically possible.
            circuit_adj_position_gain = clamp(position_gain * overtake_rate)

            luck         = luck_map.get(driver_id, 0.5)
            weather_score = weather_map.get(driver_id, 0.5)
            long_run     = long_run_map.get(driver_id, 0.5)
            reliability  = reliability_map.get(driver_id, 0.5)
            quali_delta  = quali_delta_map.get(driver_id, 0.5)
            sector_strength = sector_map.get(driver_id, 0.5)
            tyre_deg     = tyre_deg_map.get(driver_id, 0.5)

            raw = (
                car_perf                  * WEIGHTS["car_performance"] +
                long_run                  * WEIGHTS["long_run_pace"] +
                tyre_deg                  * WEIGHTS["tyre_degradation"] +
                reliability               * WEIGHTS["reliability"] +
                quali_delta               * WEIGHTS["qualifying_delta"] +
                driver_rating             * WEIGHTS["driver_rating"] +
                win_rate                  * WEIGHTS["win_rate"] +
                luck                      * WEIGHTS["luck_factor"] +
                sector_strength           * WEIGHTS["sector_strength"] +
                circuit_adj_start_pos     * WEIGHTS["circuit_adj_start_pos"] +
                circuit_adj_position_gain * WEIGHTS["circuit_adj_position_gain"] +
                weather_score             * WEIGHTS["weather_impact"]
            )

            rows_to_upsert.append({
                "race_id":                       race_id,
                "driver_id":                     driver_id,
                "car_performance_score":          round(car_perf, 5),
                "driver_rating_score":            round(driver_rating, 5),
                "starting_position_score":        round(start_pos, 5),
                "win_rate_score":                 round(win_rate, 5),
                "luck_factor_score":              round(luck, 5),
                "weather_impact_score":           round(weather_score, 5),
                "track_overtake_score":           None,
                "position_gain_score":            round(position_gain, 5),
                "long_run_pace_score":            round(long_run, 5),
                "reliability_score":              round(reliability, 5),
                "qualifying_delta_score":         round(quali_delta, 5),
                "sector_strength_score":          round(sector_strength, 5),
                "tyre_deg_score":                 round(tyre_deg, 5),
                "circuit_adj_start_pos_score":    round(circuit_adj_start_pos, 5),
                "circuit_adj_position_gain_score": round(circuit_adj_position_gain, 5),
                "raw_weighted_score":             round(raw, 6),
                "win_probability":                0.0,
                "predicted_position":             None,
            })

        upsert(conn, "driver_prediction_features", rows_to_upsert, ["race_id", "driver_id"])
        print(f"  Computed features for {len(rows_to_upsert)} drivers (weighted-v3)")

    finally:
        conn.close()


# ── Feature helpers ────────────────────────────────────────────────────────────

def _compute_long_run_pace(conn, driver_ids: list[int], race_id: int, circuit_id: int) -> dict[int, float]:
    """
    Primary: FP2 MEDIUM-normalised median lap time from fp2_long_run_times.
    Fallback: historical circuit median from lap_times (last 6 completed races).
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT driver_id, MIN(median_lap_ms) AS best_median_ms
            FROM fp2_long_run_times
            WHERE race_id = %s AND driver_id = ANY(%s) AND median_lap_ms IS NOT NULL
            GROUP BY driver_id
            """,
            (race_id, driver_ids),
        )
        fp2_map = {r["driver_id"]: float(r["best_median_ms"]) for r in cur.fetchall()}

    # Use FP2 when ≥70% of drivers have data; otherwise fall back to historical
    if len(fp2_map) >= len(driver_ids) * 0.7:
        pace_map = fp2_map
    else:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM races "
                "WHERE circuit_id = %s AND status = 'completed' AND id != %s "
                "ORDER BY race_date DESC LIMIT 6",
                (circuit_id, race_id),
            )
            past_ids = [r["id"] for r in cur.fetchall()]

        if not past_ids:
            return {d: 0.5 for d in driver_ids}

        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT lt.driver_id,
                       PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY lt.lap_time_ms) AS median_ms
                FROM lap_times lt
                WHERE lt.race_id = ANY(%s)
                  AND lt.driver_id = ANY(%s)
                  AND lt.is_pit_lap = false
                  AND lt.lap_number > 1
                  AND lt.lap_time_ms IS NOT NULL
                  AND lt.lap_time_ms > 0
                GROUP BY lt.driver_id
                """,
                (past_ids, driver_ids),
            )
            pace_map = {r["driver_id"]: float(r["median_ms"]) for r in cur.fetchall()}

    if not pace_map:
        return {d: 0.5 for d in driver_ids}

    worst = max(pace_map.values()) * 1.02
    times = [pace_map.get(d, worst) for d in driver_ids]
    max_t = max(times)
    inverted = [max_t - t for t in times]
    normalized = normalize_minmax(inverted)
    return {driver_ids[i]: normalized[i] for i in range(len(driver_ids))}


def _compute_tyre_degradation(conn, driver_ids: list[int], race_id: int, circuit_id: int) -> dict[int, float]:
    """
    REGR_SLOPE(lap_time_ms, tyre_life) across last 4 races at this circuit.
    Uses laps with tyre_life >= 3 to skip warm-up laps.
    Lower slope = better tyre management = higher score.
    """
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id FROM races "
            "WHERE circuit_id = %s AND status = 'completed' AND id != %s "
            "ORDER BY race_date DESC LIMIT 4",
            (circuit_id, race_id),
        )
        past_ids = [r["id"] for r in cur.fetchall()]

    if not past_ids:
        return {d: 0.5 for d in driver_ids}

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT d_cur.id AS driver_id,
                   REGR_SLOPE(lt.lap_time_ms::float, lt.tyre_life::float) AS deg_slope
            FROM drivers d_cur
            JOIN drivers d_hist ON d_hist.code = d_cur.code
            JOIN lap_times lt ON lt.driver_id = d_hist.id
            WHERE lt.race_id = ANY(%s)
              AND d_cur.id = ANY(%s)
              AND lt.is_pit_lap = false
              AND lt.lap_time_ms IS NOT NULL AND lt.lap_time_ms > 0
              AND lt.tyre_life IS NOT NULL AND lt.tyre_life >= 3
              AND lt.compound IN ('SOFT', 'MEDIUM', 'HARD')
            GROUP BY d_cur.id
            HAVING COUNT(*) >= 10
            """,
            (past_ids, driver_ids),
        )
        slope_map = {r["driver_id"]: float(r["deg_slope"]) for r in cur.fetchall()
                     if r["deg_slope"] is not None}

    if not slope_map:
        return {d: 0.5 for d in driver_ids}

    all_slopes = sorted(slope_map.values())
    mid = len(all_slopes) // 2
    field_median = all_slopes[mid]

    slopes = [slope_map.get(d, field_median) for d in driver_ids]
    max_slope = max(slopes)
    inverted = [max_slope - s for s in slopes]
    normalized = normalize_minmax(inverted) if len(set(inverted)) > 1 else [0.5] * len(driver_ids)
    return {driver_ids[i]: normalized[i] for i in range(len(driver_ids))}


def _compute_reliability(driver_ids, stats_rows, team_data):
    scores = []
    for d in driver_ids:
        stat = stats_rows.get(d)
        team_id = stat["team_id"] if stat else None
        team_rel = team_data.get(team_id, {}).get("reliability", 0.5) if team_id else 0.5
        dnf_rate = float(stat["dnf_rate"]) if stat and stat.get("dnf_rate") is not None else 0.1
        scores.append(team_rel * 0.7 + (1.0 - dnf_rate) * 0.3)

    normalized = normalize_minmax(scores) if len(set(scores)) > 1 else scores
    return {driver_ids[i]: normalized[i] for i in range(len(driver_ids))}


def _compute_qualifying_delta(conn, driver_ids: list[int], race_id: int) -> dict[int, float]:
    """
    Rolling weighted mean of teammate qualifying delta across the last 5 races
    (cross-season via driver.code). Weight: most recent = 5, oldest = 1.
    Positive = driver was faster than teammate.
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
                       LEAST(NULLIF(qr.q3_time_ms,0), NULLIF(qr.q2_time_ms,0), NULLIF(qr.q1_time_ms,0)) AS best_ms,
                       r.race_date
                FROM drivers d_cur
                JOIN drivers d_hist ON d_hist.code = d_cur.code
                JOIN qualifying_results qr ON qr.driver_id = d_hist.id
                JOIN races r ON qr.race_id = r.id
                WHERE d_cur.id = ANY(%s)
                  AND r.race_date <= %s
                  AND r.status IN ('qualifying_done', 'completed')
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


def _compute_sector_strength(conn, driver_ids, race_id):
    with conn.cursor() as cur:
        cur.execute(
            "SELECT driver_id, sector1_ms, sector2_ms, sector3_ms "
            "FROM qualifying_results WHERE race_id = %s AND driver_id = ANY(%s)",
            (race_id, driver_ids),
        )
        rows = {r["driver_id"]: r for r in cur.fetchall()}

    if not rows or not any(r.get("sector1_ms") for r in rows.values()):
        return {d: 0.5 for d in driver_ids}

    def sector_norm(col):
        pairs = [(d, float(rows[d][col])) for d in driver_ids if d in rows and rows[d].get(col)]
        if not pairs:
            return {}
        max_t = max(t for _, t in pairs)
        inverted = {did: max_t - t for did, t in pairs}
        normed = normalize_minmax(list(inverted.values()))
        ids = list(inverted.keys())
        return {ids[i]: normed[i] for i in range(len(ids))}

    s1, s2, s3 = sector_norm("sector1_ms"), sector_norm("sector2_ms"), sector_norm("sector3_ms")
    combined = {}
    for d in driver_ids:
        scores = [s for s in [s1.get(d), s2.get(d), s3.get(d)] if s is not None]
        combined[d] = sum(scores) / len(scores) if scores else 0.5
    return combined


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
