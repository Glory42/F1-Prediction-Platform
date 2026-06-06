import datetime
from src.db.client import get_conn
from src.utils.fastf1_helpers import get_session, session_to_quali_results


SUPPORTED_FORMATS = {"conventional", "sprint_qualifying", "sprint", "sprint_shootout"}


def run(year: int, round_num: int) -> None:
    print(f"[ingest_qualifying] year={year} round={round_num}")

    conn = get_conn()
    try:
        with conn.cursor() as cur:
            # Resolve race_id, season_id, event_format, and qualifying_date
            cur.execute(
                "SELECT r.id, r.season_id, r.event_format, "
                "       COALESCE(r.qualifying_date::date, r.race_date::date - 1) AS quali_day "
                "FROM races r JOIN seasons s ON r.season_id = s.id "
                "WHERE s.year = %s AND r.round_number = %s",
                (year, round_num),
            )
            race_row = cur.fetchone()
        if not race_row:
            raise ValueError(f"Race not found in DB for year={year} round={round_num}")

        if race_row["quali_day"] > datetime.date.today():
            raise RuntimeError(
                f"Qualifying for {year} R{round_num} is on {race_row['quali_day']} — not yet. Skipping."
            )

        event_format = race_row["event_format"] or "conventional"
        if event_format not in SUPPORTED_FORMATS:
            raise ValueError(
                f"Cannot run ingest_qualifying for event_format='{event_format}' "
                f"(round {round_num}). Only standard qualifying formats are supported."
            )
        print(f"  event_format={event_format} — ingesting Session4 (main qualifying)")

        race_id = race_row["id"]
        season_id = race_row["season_id"]

        # Build driver_code → driver_id map for this season
        with conn.cursor() as cur:
            cur.execute("SELECT id, code FROM drivers WHERE season_id = %s", (season_id,))
            driver_map: dict[str, int] = {row["code"]: row["id"] for row in cur.fetchall()}

        session = get_session(year, round_num, "Q", messages=True)
        quali_rows = session_to_quali_results(session)

        rows_to_upsert = []
        for qr in quali_rows:
            code = qr["driver_code"]
            driver_id = driver_map.get(code)
            if not driver_id:
                print(f"  [warn] Unknown driver code: {code}")
                continue
            rows_to_upsert.append({
                "race_id": race_id,
                "driver_id": driver_id,
                "grid_position": qr["grid_position"],
                "q1_time_ms": qr["q1_time_ms"],
                "q2_time_ms": qr["q2_time_ms"],
                "q3_time_ms": qr["q3_time_ms"],
                "sector1_ms": qr.get("sector1_ms"),
                "sector2_ms": qr.get("sector2_ms"),
                "sector3_ms": qr.get("sector3_ms"),
                "speed_st": qr.get("speed_st"),
            })

        if not rows_to_upsert:
            raise RuntimeError(f"No qualifying results found for {year} R{round_num} — session may not have data yet")

        from src.utils.upsert import upsert
        upsert(conn, "qualifying_results", rows_to_upsert, ["race_id", "driver_id"])
        print(f"  Upserted {len(rows_to_upsert)} qualifying rows")

        with conn.cursor() as cur:
            cur.execute(
                "UPDATE races SET status = 'qualifying_done' WHERE id = %s AND status = 'scheduled'",
                (race_id,),
            )
        conn.commit()
        print(f"  Race {race_id} status → qualifying_done")

    finally:
        conn.close()
