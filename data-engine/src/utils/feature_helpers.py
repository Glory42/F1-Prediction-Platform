from collections import defaultdict
from src.utils.math_utils import normalize_minmax, clamp


def compute_weather_score(conn, driver_ids: list[int], weather: str) -> dict[int, float]:
    """Historical wet-race finish position (cross-season via driver.code), normalized. Neutral (0.5) if dry."""
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


def car_rank(team_id, team_perf: dict) -> float:
    if not team_id:
        return 10.0
    return 20.0 - (team_perf.get(team_id, 0.5) * 19.0)


def compute_luck_score(conn, driver_ids: list[int], race_id: int, team_perf: dict, stats_rows: dict) -> dict[int, float]:
    """Finish position vs expected (avg of grid + car rank), last 5 completed races, cross-season via driver.code."""
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
        rank = car_rank(team_id, team_perf)
        recent = driver_results[driver_id]
        if not recent:
            deltas[driver_id] = 0.0
            continue
        driver_deltas = [(rr["grid_position"] + rank) / 2.0 - rr["finish_position"] for rr in recent]
        deltas[driver_id] = sum(driver_deltas) / len(driver_deltas)

    vals = list(deltas.values())
    normalized = normalize_minmax(vals)
    return {driver_id: normalized[i] for i, driver_id in enumerate(deltas.keys())}


def circuit_adj_start_pos(start_pos: float, overtake_rate: float, sc_probability: float) -> float:
    """
    Starting position matters more at low-overtake tracks (Monaco) and less at high (Monza).
    SC probability reduces grid advantage further — high-SC circuits bunch the field.
    Shared by the GP and sprint models — same formula, different WEIGHTS.
    """
    return clamp(start_pos * (1 + (1 - overtake_rate)) * (1 - 0.3 * sc_probability))


def compute_rolling_teammate_delta(
    conn,
    driver_ids: list[int],
    race_id: int,
    *,
    table: str,
    time_cols: tuple[str, str, str],
    status_filter: tuple[str, ...],
) -> dict[int, float]:
    """
    Rolling weighted mean of teammate qualifying delta across the last 5 sessions
    (cross-season via driver.code). Weight: most recent = 5, oldest = 1.
    Positive = driver was faster than teammate.

    `table`/`time_cols`/`status_filter` distinguish GP qualifying from sprint qualifying —
    the algorithm itself is identical between the two models.
    """
    with conn.cursor() as cur:
        cur.execute("SELECT race_date FROM races WHERE id = %s", (race_id,))
        race_info = cur.fetchone()
    if not race_info:
        return {d: 0.5 for d in driver_ids}

    q1_col, q2_col, q3_col = time_cols

    with conn.cursor() as cur:
        cur.execute(
            f"""
            SELECT sub.driver_id, sub.team_id, sub.best_ms, sub.race_date,
                   ROW_NUMBER() OVER (PARTITION BY sub.driver_id ORDER BY sub.race_date DESC) AS rn
            FROM (
                SELECT d_cur.id AS driver_id, d_hist.team_id,
                       LEAST(NULLIF(qr.{q3_col},0), NULLIF(qr.{q2_col},0), NULLIF(qr.{q1_col},0)) AS best_ms,
                       r.race_date
                FROM drivers d_cur
                JOIN drivers d_hist ON d_hist.code = d_cur.code
                JOIN {table} qr ON qr.driver_id = d_hist.id
                JOIN races r ON qr.race_id = r.id
                WHERE d_cur.id = ANY(%s)
                  AND r.race_date <= %s
                  AND r.status::text = ANY(%s)
            ) sub
            WHERE sub.best_ms IS NOT NULL
            """,
            (driver_ids, race_info["race_date"], list(status_filter)),
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
