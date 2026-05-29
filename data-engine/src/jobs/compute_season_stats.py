from src.db.client import get_conn
from src.utils.math_utils import normalize_minmax
from src.utils.upsert import upsert


def run(year: int) -> None:
    print(f"[compute_season_stats] year={year}")

    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM seasons WHERE year = %s", (year,))
            row = cur.fetchone()
        if not row:
            raise ValueError(f"Season {year} not found")
        season_id = row["id"]

        _compute_driver_stats(conn, season_id)
        _compute_team_stats(conn, season_id)

    finally:
        conn.close()


def _compute_driver_stats(conn, season_id: int) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
                d.id AS driver_id,
                COUNT(rr.id) AS races_entered,
                COUNT(rr.id) FILTER (WHERE rr.finish_position IS NOT NULL) AS races_finished,
                COUNT(rr.id) FILTER (WHERE rr.finish_position = 1) AS wins,
                COUNT(rr.id) FILTER (WHERE rr.finish_position <= 3) AS podiums,
                COUNT(rr.id) FILTER (WHERE rr.finish_position IS NULL) AS dnf_count,
                COALESCE(SUM(rr.points::numeric), 0) AS total_points,
                AVG(rr.finish_position) FILTER (WHERE rr.finish_position IS NOT NULL) AS avg_finish,
                AVG(rr.grid_position - rr.finish_position) FILTER (WHERE rr.finish_position IS NOT NULL) AS avg_gain
            FROM drivers d
            JOIN races r ON r.season_id = d.season_id
            JOIN race_results rr ON rr.race_id = r.id AND rr.driver_id = d.id
            WHERE d.season_id = %s AND r.status = 'completed'
            GROUP BY d.id
            """,
            (season_id,),
        )
        driver_aggs = cur.fetchall()

        sorted_drivers = sorted(driver_aggs, key=lambda x: float(x["total_points"]), reverse=True)
        position_map = {row["driver_id"]: i + 1 for i, row in enumerate(sorted_drivers)}

        cur.execute(
            """
            SELECT qr.driver_id, COUNT(*) AS poles
            FROM qualifying_results qr
            JOIN races r ON qr.race_id = r.id
            WHERE r.season_id = %s AND qr.grid_position = 1
            GROUP BY qr.driver_id
            """,
            (season_id,),
        )
        poles_map = {row["driver_id"]: int(row["poles"]) for row in cur.fetchall()}

    # Sector times and top speed from lap_times (clean laps only)
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
                lt.driver_id,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY lt.sector1_ms) AS med_s1,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY lt.sector2_ms) AS med_s2,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY lt.sector3_ms) AS med_s3,
                MAX(lt.speed_st::numeric) AS top_speed
            FROM lap_times lt
            JOIN races r ON lt.race_id = r.id
            JOIN drivers d ON lt.driver_id = d.id
            WHERE d.season_id = %s
              AND r.status = 'completed'
              AND lt.is_pit_lap = false
              AND lt.lap_number > 1
            GROUP BY lt.driver_id
            """,
            (season_id,),
        )
        sector_map = {
            r["driver_id"]: {
                "avg_sector1_ms": int(r["med_s1"]) if r["med_s1"] is not None else None,
                "avg_sector2_ms": int(r["med_s2"]) if r["med_s2"] is not None else None,
                "avg_sector3_ms": int(r["med_s3"]) if r["med_s3"] is not None else None,
                "top_speed_avg": round(float(r["top_speed"]), 1) if r["top_speed"] is not None else None,
            }
            for r in cur.fetchall()
        }

    # Teammate qualifying delta: per race, compute gap vs teammate, then average
    teammate_deltas = _compute_teammate_quali_deltas(conn, season_id)

    rows_to_upsert = []
    for d in driver_aggs:
        races_entered = int(d["races_entered"])
        wins = int(d["wins"])
        dnf_count = int(d["dnf_count"])
        win_rate = (wins + 0.5) / (races_entered + 2) if races_entered > 0 else 0.25
        dnf_rate = round(dnf_count / races_entered, 3) if races_entered > 0 else None

        sectors = sector_map.get(d["driver_id"], {})

        rows_to_upsert.append({
            "season_id": season_id,
            "driver_id": d["driver_id"],
            "races_entered": races_entered,
            "races_finished": int(d["races_finished"]),
            "wins": wins,
            "podiums": int(d["podiums"]),
            "poles": poles_map.get(d["driver_id"], 0),
            "total_points": float(d["total_points"]),
            "championship_position": position_map.get(d["driver_id"]),
            "avg_finish_position": round(float(d["avg_finish"]), 2) if d["avg_finish"] is not None else None,
            "win_rate": round(win_rate, 4),
            "avg_position_gain": round(float(d["avg_gain"]), 2) if d["avg_gain"] is not None else None,
            "dnf_count": dnf_count,
            "dnf_rate": dnf_rate,
            "avg_sector1_ms": sectors.get("avg_sector1_ms"),
            "avg_sector2_ms": sectors.get("avg_sector2_ms"),
            "avg_sector3_ms": sectors.get("avg_sector3_ms"),
            "top_speed_avg": sectors.get("top_speed_avg"),
            "teammate_quali_delta": teammate_deltas.get(d["driver_id"]),
        })

    if rows_to_upsert:
        upsert(conn, "driver_season_stats", rows_to_upsert, ["season_id", "driver_id"])
        print(f"  Updated {len(rows_to_upsert)} driver_season_stats rows")


def _compute_teammate_quali_deltas(conn, season_id: int) -> dict[int, float | None]:
    """
    For each driver, compute mean qualifying delta vs their teammate across all races.
    Positive = driver is faster than teammate (lower time).
    Returns dict[driver_id → delta_fraction] or None if not enough data.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
                qr.driver_id,
                d.team_id,
                LEAST(
                    NULLIF(qr.q3_time_ms, 0),
                    NULLIF(qr.q2_time_ms, 0),
                    NULLIF(qr.q1_time_ms, 0)
                ) AS best_time,
                qr.race_id
            FROM qualifying_results qr
            JOIN drivers d ON qr.driver_id = d.id
            JOIN races r ON qr.race_id = r.id
            WHERE d.season_id = %s
            ORDER BY qr.race_id
            """,
            (season_id,),
        )
        rows = cur.fetchall()

    # Group by race then team to find teammate pairs
    from collections import defaultdict
    race_team: dict[int, dict[int, list[tuple]]] = defaultdict(lambda: defaultdict(list))
    for r in rows:
        if r["best_time"] is not None:
            race_team[r["race_id"]][r["team_id"]].append((r["driver_id"], float(r["best_time"])))

    driver_deltas: dict[int, list[float]] = defaultdict(list)
    for race_id, team_data in race_team.items():
        for team_id, drivers_times in team_data.items():
            if len(drivers_times) != 2:
                continue
            d1_id, t1 = drivers_times[0]
            d2_id, t2 = drivers_times[1]
            # delta = (teammate - self) / teammate → positive means self is faster
            delta1 = (t2 - t1) / t2
            delta2 = (t1 - t2) / t1
            driver_deltas[d1_id].append(delta1)
            driver_deltas[d2_id].append(delta2)

    return {
        driver_id: round(sum(deltas) / len(deltas), 4) if deltas else None
        for driver_id, deltas in driver_deltas.items()
    }


def _compute_team_stats(conn, season_id: int) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
                t.id AS team_id,
                COUNT(DISTINCT r.id) AS races_completed,
                COUNT(rr.id) FILTER (WHERE rr.finish_position = 1) AS wins,
                COUNT(rr.id) FILTER (WHERE rr.finish_position <= 3) AS podiums,
                COUNT(rr.id) FILTER (WHERE rr.finish_position IS NULL) AS dnf_count,
                COUNT(rr.id) AS total_entries,
                COALESCE(SUM(rr.points::numeric), 0) AS total_points,
                AVG(rr.finish_position) FILTER (WHERE rr.finish_position IS NOT NULL) AS avg_finish
            FROM teams t
            JOIN drivers d ON d.team_id = t.id AND d.season_id = t.season_id
            JOIN races r ON r.season_id = t.season_id AND r.status = 'completed'
            JOIN race_results rr ON rr.race_id = r.id AND rr.driver_id = d.id
            WHERE t.season_id = %s
            GROUP BY t.id
            """,
            (season_id,),
        )
        team_aggs = cur.fetchall()

    if not team_aggs:
        return

    sorted_teams = sorted(team_aggs, key=lambda x: float(x["total_points"]), reverse=True)
    position_map = {row["team_id"]: i + 1 for i, row in enumerate(sorted_teams)}

    avg_finishes = [float(t["avg_finish"]) if t["avg_finish"] is not None else 20.0 for t in team_aggs]
    inverted = [21.0 - f for f in avg_finishes]
    car_perf_normalized = normalize_minmax(inverted)

    # Reliability score = 1 - dnf_rate, normalized
    dnf_rates = [
        int(t["dnf_count"]) / max(int(t["total_entries"]), 1)
        for t in team_aggs
    ]
    reliability_raw = [1.0 - rate for rate in dnf_rates]
    reliability_normalized = normalize_minmax(reliability_raw) if len(set(reliability_raw)) > 1 else [0.5] * len(reliability_raw)

    rows_to_upsert = []
    for i, t in enumerate(team_aggs):
        total_entries = int(t["total_entries"])
        dnf_count = int(t["dnf_count"])
        rows_to_upsert.append({
            "season_id": season_id,
            "team_id": t["team_id"],
            "races_completed": int(t["races_completed"]),
            "wins": int(t["wins"]),
            "podiums": int(t["podiums"]),
            "total_points": float(t["total_points"]),
            "championship_position": position_map.get(t["team_id"]),
            "avg_finish_position": round(float(t["avg_finish"]), 2) if t["avg_finish"] is not None else None,
            "car_performance_score": round(car_perf_normalized[i], 5),
            "dnf_count": dnf_count,
            "reliability_score": round(reliability_normalized[i], 5),
        })

    upsert(conn, "team_season_stats", rows_to_upsert, ["season_id", "team_id"])
    print(f"  Updated {len(rows_to_upsert)} team_season_stats rows")
