from src.db.client import get_conn
from src.utils.fastf1_helpers import (
    get_session, session_to_race_results, session_to_lap_times,
    get_weather, get_weather_details, get_sc_vsc_laps, validate_session_data,
)
from src.utils.upsert import upsert


def run(year: int, round_num: int) -> None:
    print(f"[ingest_race] year={year} round={round_num}")

    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT r.id, r.season_id, r.circuit_id FROM races r "
                "JOIN seasons s ON r.season_id = s.id "
                "WHERE s.year = %s AND r.round_number = %s",
                (year, round_num),
            )
            race_row = cur.fetchone()
        if not race_row:
            raise ValueError(f"Race not found for year={year} round={round_num}")

        race_id = race_row["id"]
        season_id = race_row["season_id"]
        circuit_id = race_row["circuit_id"]

        with conn.cursor() as cur:
            cur.execute("SELECT id, code FROM drivers WHERE season_id = %s", (season_id,))
            driver_map: dict[str, int] = {row["code"]: row["id"] for row in cur.fetchall()}

        session = get_session(year, round_num, "R")

        if not validate_session_data(session, "R"):
            raise RuntimeError("Race results not fully available or complete yet — retry later")

        weather = get_weather(session)
        weather_details = get_weather_details(session)
        sc_vsc = get_sc_vsc_laps(session)
        race_result_rows = session_to_race_results(session)
        lap_time_rows = session_to_lap_times(session)

        # Update driver headshot URLs
        headshot_updates = {}
        for rr in race_result_rows:
            if rr.get("headshot_url"):
                driver_id = driver_map.get(rr["driver_code"])
                if driver_id:
                    headshot_updates[driver_id] = rr["headshot_url"]

        if headshot_updates:
            with conn.cursor() as cur:
                for driver_id, url in headshot_updates.items():
                    cur.execute(
                        "UPDATE drivers SET headshot_url = %s WHERE id = %s AND headshot_url IS NULL",
                        (url, driver_id),
                    )
            print(f"  Updated {len(headshot_updates)} driver headshot URLs")

        results_to_upsert = []
        for rr in race_result_rows:
            driver_id = driver_map.get(rr["driver_code"])
            if not driver_id:
                print(f"  [warn] Unknown driver: {rr['driver_code']}")
                continue
            results_to_upsert.append({
                "race_id": race_id,
                "driver_id": driver_id,
                "finish_position": rr["finish_position"],
                "grid_position": rr["grid_position"],
                "points": rr["points"],
                "status": rr["status"],
                "total_race_time_ms": rr["total_race_time_ms"],
                "fastest_lap": rr["fastest_lap"],
            })

        laps_to_upsert = []
        for lt in lap_time_rows:
            driver_id = driver_map.get(lt["driver_code"])
            if not driver_id:
                continue
            laps_to_upsert.append({
                "race_id": race_id,
                "driver_id": driver_id,
                "lap_number": lt["lap_number"],
                "lap_time_ms": lt["lap_time_ms"],
                "sector1_ms": lt["sector1_ms"],
                "sector2_ms": lt["sector2_ms"],
                "sector3_ms": lt["sector3_ms"],
                "speed_st": lt["speed_st"],
                "compound": lt["compound"],
                "tyre_life": lt["tyre_life"],
                "fresh_tyre": lt["fresh_tyre"],
                "is_pit_lap": lt["is_pit_lap"],
                "stint_number": lt["stint_number"],
            })

        if not results_to_upsert:
            raise RuntimeError(f"No results inserted for race {race_id} — all driver codes unknown")

        upsert(conn, "race_results", results_to_upsert, ["race_id", "driver_id"])
        print(f"  Upserted {len(results_to_upsert)} race result rows")

        if laps_to_upsert:
            upsert(conn, "lap_times", laps_to_upsert, ["race_id", "driver_id", "lap_number"])
            print(f"  Upserted {len(laps_to_upsert)} lap time rows")

        with conn.cursor() as cur:
            cur.execute(
                """UPDATE races
                   SET status = 'completed',
                       weather = %s,
                       safety_car_laps = %s,
                       vsc_laps = %s,
                       air_temp_avg = %s,
                       track_temp_avg = %s,
                       humidity_avg = %s
                   WHERE id = %s""",
                (
                    weather,
                    sc_vsc["safety_car_laps"],
                    sc_vsc["vsc_laps"],
                    weather_details["air_temp_avg"],
                    weather_details["track_temp_avg"],
                    weather_details["humidity_avg"],
                    race_id,
                ),
            )
        # Refresh sc_probability for this circuit from all completed races
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE circuits
                SET sc_probability = (
                    SELECT ROUND(
                        COUNT(*) FILTER (WHERE r2.safety_car_laps > 0)::numeric /
                        NULLIF(COUNT(*) FILTER (WHERE r2.status = 'completed'), 0),
                        3
                    )
                    FROM races r2
                    WHERE r2.circuit_id = circuits.id AND r2.status = 'completed'
                )
                WHERE circuits.id = %s
                """,
                (circuit_id,),
            )
        conn.commit()
        print(
            f"  Race {race_id} → completed | weather={weather} "
            f"SC={sc_vsc['safety_car_laps']} VSC={sc_vsc['vsc_laps']} "
            f"AirTemp={weather_details['air_temp_avg']}°C"
        )

    finally:
        conn.close()
