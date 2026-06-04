from src.db.client import get_conn
from src.utils.fastf1_helpers import get_session, session_to_race_results, session_to_lap_times, get_weather, get_weather_details, get_sc_vsc_laps
from src.utils.upsert import upsert

SPRINT_FORMATS = {"sprint", "sprint_qualifying", "sprint_shootout"}


def run(year: int, round_num: int) -> None:
    print(f"[ingest_sprint] year={year} round={round_num}")

    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT r.id, r.season_id, r.event_format FROM races r "
                "JOIN seasons s ON r.season_id = s.id "
                "WHERE s.year = %s AND r.round_number = %s",
                (year, round_num),
            )
            race_row = cur.fetchone()
        if not race_row:
            raise ValueError(f"Race not found for year={year} round={round_num}")

        event_format = race_row["event_format"] or ""
        if event_format not in SPRINT_FORMATS:
            raise ValueError(
                f"Round {round_num} has event_format='{event_format}' — not a sprint weekend. "
                "Cannot run ingest_sprint."
            )

        race_id = race_row["id"]
        season_id = race_row["season_id"]
        print(f"  event_format={event_format} — ingesting Session3 (sprint race)")

        with conn.cursor() as cur:
            cur.execute("SELECT id, code FROM drivers WHERE season_id = %s", (season_id,))
            driver_map: dict[str, int] = {row["code"]: row["id"] for row in cur.fetchall()}

        session = get_session(year, round_num, "S")

        if session.results is None or session.results.empty:
            raise RuntimeError("Sprint results not available yet — retry later")

        sprint_result_rows = session_to_race_results(session)

        # Update driver headshot URLs from sprint session
        headshot_updates = {}
        for rr in sprint_result_rows:
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

        results_to_upsert = []
        for rr in sprint_result_rows:
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
                "total_sprint_time_ms": rr["total_race_time_ms"],
                "fastest_lap": rr["fastest_lap"],
            })

        if not results_to_upsert:
            raise RuntimeError(f"No sprint results for race {race_id} — all driver codes unknown")

        upsert(conn, "sprint_results", results_to_upsert, ["race_id", "driver_id"])
        print(f"  Upserted {len(results_to_upsert)} sprint result rows")

        # Sprint race conditions
        sprint_weather = get_weather(session)
        weather_details = get_weather_details(session)
        sc_vsc = get_sc_vsc_laps(session)

        with conn.cursor() as cur:
            cur.execute(
                """UPDATE races SET
                    sprint_weather = %s,
                    sprint_safety_car_laps = %s,
                    sprint_vsc_laps = %s,
                    sprint_air_temp_avg = %s,
                    sprint_track_temp_avg = %s,
                    sprint_humidity_avg = %s
                WHERE id = %s""",
                (
                    sprint_weather,
                    sc_vsc["safety_car_laps"],
                    sc_vsc["vsc_laps"],
                    weather_details["air_temp_avg"],
                    weather_details["track_temp_avg"],
                    weather_details["humidity_avg"],
                    race_id,
                ),
            )
        print(f"  Updated sprint conditions: weather={sprint_weather}, SC={sc_vsc['safety_car_laps']}, VSC={sc_vsc['vsc_laps']}")

        # Sprint lap times
        lap_rows = session_to_lap_times(session)
        laps_to_upsert = []
        for lap in lap_rows:
            driver_id = driver_map.get(lap["driver_code"])
            if not driver_id:
                continue
            laps_to_upsert.append({
                "race_id": race_id,
                "driver_id": driver_id,
                "lap_number": lap["lap_number"],
                "lap_time_ms": lap["lap_time_ms"],
                "sector1_ms": lap["sector1_ms"],
                "sector2_ms": lap["sector2_ms"],
                "sector3_ms": lap["sector3_ms"],
                "speed_st": lap["speed_st"],
                "compound": lap["compound"],
                "tyre_life": lap["tyre_life"],
                "fresh_tyre": lap["fresh_tyre"],
                "is_pit_lap": lap["is_pit_lap"],
            })

        if laps_to_upsert:
            upsert(conn, "sprint_lap_times", laps_to_upsert, ["race_id", "driver_id", "lap_number"])
            print(f"  Upserted {len(laps_to_upsert)} sprint lap rows")

        with conn.cursor() as cur:
            cur.execute(
                "UPDATE races SET status = 'sprint_done' WHERE id = %s "
                "AND status IN ('scheduled', 'sprint_qualifying_done')",
                (race_id,),
            )
        conn.commit()
        print(f"  Race {race_id} status → sprint_done")

    finally:
        conn.close()
