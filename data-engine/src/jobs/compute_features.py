from src.db.client import get_conn
from src.utils.math_utils import normalize_minmax, bayesian_win_rate, clamp
from src.utils.upsert import upsert


WEIGHTS = {
    "car_performance":    0.22,
    "driver_rating":      0.10,
    "starting_position":  0.12,
    "win_rate":           0.10,
    "long_run_pace":      0.12,
    "reliability":        0.08,
    "luck_factor":        0.08,
    "sector_strength":    0.06,
    "qualifying_delta":   0.05,
    "weather_impact":     0.03,
    "track_overtake":     0.02,
    "position_gain":      0.02,
}
# sum = 1.00


def run(race_id: int) -> None:
    print(f"[compute_features] race_id={race_id}")

    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT r.id, r.season_id, r.weather, r.circuit_id, c.overtake_rate "
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
            luck = luck_map.get(driver_id, 0.5)
            weather_score = weather_map.get(driver_id, 0.5)
            long_run = long_run_map.get(driver_id, 0.5)
            reliability = reliability_map.get(driver_id, 0.5)
            quali_delta = quali_delta_map.get(driver_id, 0.5)
            sector_strength = sector_map.get(driver_id, 0.5)
            track_overtake = overtake_rate

            raw = (
                car_perf          * WEIGHTS["car_performance"] +
                driver_rating     * WEIGHTS["driver_rating"] +
                start_pos         * WEIGHTS["starting_position"] +
                win_rate          * WEIGHTS["win_rate"] +
                long_run          * WEIGHTS["long_run_pace"] +
                reliability       * WEIGHTS["reliability"] +
                luck              * WEIGHTS["luck_factor"] +
                sector_strength   * WEIGHTS["sector_strength"] +
                quali_delta       * WEIGHTS["qualifying_delta"] +
                weather_score     * WEIGHTS["weather_impact"] +
                track_overtake    * WEIGHTS["track_overtake"] +
                position_gain     * WEIGHTS["position_gain"]
            )

            rows_to_upsert.append({
                "race_id": race_id,
                "driver_id": driver_id,
                "car_performance_score": round(car_perf, 5),
                "driver_rating_score": round(driver_rating, 5),
                "starting_position_score": round(start_pos, 5),
                "win_rate_score": round(win_rate, 5),
                "luck_factor_score": round(luck, 5),
                "weather_impact_score": round(weather_score, 5),
                "track_overtake_score": round(track_overtake, 5),
                "position_gain_score": round(position_gain, 5),
                "long_run_pace_score": round(long_run, 5),
                "reliability_score": round(reliability, 5),
                "qualifying_delta_score": round(quali_delta, 5),
                "sector_strength_score": round(sector_strength, 5),
                "raw_weighted_score": round(raw, 6),
                "win_probability": 0.0,
                "predicted_position": None,
            })

        upsert(conn, "driver_prediction_features", rows_to_upsert, ["race_id", "driver_id"])
        print(f"  Computed features for {len(rows_to_upsert)} drivers (weighted-v2)")

    finally:
        conn.close()


# ── Feature helpers ────────────────────────────────────────────────────────────

def _compute_long_run_pace(conn, driver_ids: list[int], race_id: int, circuit_id: int) -> dict[int, float]:
    """Median clean lap time vs field at same circuit, last 6 races."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id FROM races
            WHERE circuit_id = %s AND status = 'completed' AND id != %s
            ORDER BY race_date DESC LIMIT 6
            """,
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
    # Lower time = better: invert then normalize
    max_t = max(times)
    inverted = [max_t - t for t in times]
    normalized = normalize_minmax(inverted)
    return {driver_ids[i]: normalized[i] for i in range(len(driver_ids))}


def _compute_reliability(
    driver_ids: list[int],
    stats_rows: dict,
    team_data: dict,
) -> dict[int, float]:
    """Combine team reliability score + driver personal DNF rate."""
    scores = []
    for d in driver_ids:
        stat = stats_rows.get(d)
        team_id = stat["team_id"] if stat else None
        team_rel = team_data.get(team_id, {}).get("reliability", 0.5) if team_id else 0.5

        dnf_rate = 0.1  # default ~1 in 10
        if stat and stat.get("dnf_rate") is not None:
            dnf_rate = float(stat["dnf_rate"])

        combined = team_rel * 0.7 + (1.0 - dnf_rate) * 0.3
        scores.append(combined)

    normalized = normalize_minmax(scores) if len(set(scores)) > 1 else [0.5] * len(scores)
    return {driver_ids[i]: normalized[i] for i in range(len(driver_ids))}


def _compute_qualifying_delta(conn, driver_ids: list[int], race_id: int) -> dict[int, float]:
    """How much faster/slower vs teammate in this qualifying session."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT qr.driver_id, d.team_id,
                   LEAST(NULLIF(qr.q3_time_ms,0), NULLIF(qr.q2_time_ms,0), NULLIF(qr.q1_time_ms,0)) AS best_ms
            FROM qualifying_results qr
            JOIN drivers d ON qr.driver_id = d.id
            WHERE qr.race_id = %s AND qr.driver_id = ANY(%s)
            """,
            (race_id, driver_ids),
        )
        rows = {r["driver_id"]: {"team_id": r["team_id"], "best_ms": r["best_ms"]} for r in cur.fetchall()}

    from collections import defaultdict
    team_times: dict = defaultdict(list)
    for did, data in rows.items():
        if data["best_ms"]:
            team_times[data["team_id"]].append((did, float(data["best_ms"])))

    deltas = {}
    for d in driver_ids:
        data = rows.get(d)
        if not data or not data["best_ms"]:
            deltas[d] = 0.0
            continue
        teammates = [(did, t) for did, t in team_times.get(data["team_id"], []) if did != d]
        if not teammates:
            deltas[d] = 0.0
            continue
        best_teammate = min(t for _, t in teammates)
        deltas[d] = (best_teammate - float(data["best_ms"])) / best_teammate  # positive = faster

    vals = list(deltas.values())
    normalized = normalize_minmax(vals) if len(set(vals)) > 1 else [0.5] * len(vals)
    return {d: normalized[i] for i, d in enumerate(list(deltas.keys()))}


def _compute_sector_strength(conn, driver_ids: list[int], race_id: int) -> dict[int, float]:
    """Best sector time advantage vs field in qualifying."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT driver_id, sector1_ms, sector2_ms, sector3_ms
            FROM qualifying_results
            WHERE race_id = %s AND driver_id = ANY(%s)
            """,
            (race_id, driver_ids),
        )
        rows = {r["driver_id"]: r for r in cur.fetchall()}

    if not rows or not any(r.get("sector1_ms") for r in rows.values()):
        return {d: 0.5 for d in driver_ids}

    def sector_norm(col: str) -> dict[int, float]:
        pairs = [(d, float(rows[d][col])) for d in driver_ids if d in rows and rows[d].get(col)]
        if not pairs:
            return {}
        max_t = max(t for _, t in pairs)
        inverted = {did: max_t - t for did, t in pairs}
        vals = list(inverted.values())
        normed = normalize_minmax(vals)
        ids = list(inverted.keys())
        return {ids[i]: normed[i] for i in range(len(ids))}

    s1 = sector_norm("sector1_ms")
    s2 = sector_norm("sector2_ms")
    s3 = sector_norm("sector3_ms")

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


def _compute_weather(conn, driver_ids, weather):
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
