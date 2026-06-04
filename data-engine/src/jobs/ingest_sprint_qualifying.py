import datetime
from src.db.client import get_conn
from src.utils.upsert import upsert
from src.utils.fastf1_helpers import get_session, session_to_quali_results

SPRINT_FORMATS = {"sprint", "sprint_qualifying", "sprint_shootout"}


def run(year: int, round_num: int) -> None:
    """
    Ingest Sprint Qualifying (SQ) results. Writes grid positions and SQ1/SQ2/SQ3
    lap times into sprint_results so compute_sprint_features can run before the sprint.
    ingest_sprint will later upsert the full finish results into the same rows.
    """
    print(f"[ingest_sprint_qualifying] year={year} round={round_num}")

    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT r.id, r.season_id, r.event_format, r.sprint_qualifying_date::date AS sq_day "
                "FROM races r JOIN seasons s ON r.season_id = s.id "
                "WHERE s.year = %s AND r.round_number = %s",
                (year, round_num),
            )
            race_row = cur.fetchone()
        if not race_row:
            raise ValueError(f"Race not found for year={year} round={round_num}")

        if race_row["sq_day"] and race_row["sq_day"] > datetime.date.today():
            raise RuntimeError(
                f"Sprint qualifying for {year} R{round_num} is on {race_row['sq_day']} — not yet. Skipping."
            )

        event_format = race_row["event_format"] or ""
        if event_format not in SPRINT_FORMATS:
            raise ValueError(
                f"Round {round_num} has event_format='{event_format}' — not a sprint weekend. "
                "Cannot run ingest_sprint_qualifying."
            )

        race_id = race_row["id"]
        season_id = race_row["season_id"]
        # 2023 renamed "Sprint Qualifying" → "Sprint Shootout" (FastF1 identifier: "SS")
        sq_type = "SS" if event_format == "sprint_shootout" else "SQ"
        print(f"  event_format={event_format} — ingesting {sq_type} session")

        with conn.cursor() as cur:
            cur.execute("SELECT id, code FROM drivers WHERE season_id = %s", (season_id,))
            driver_map: dict[str, int] = {row["code"]: row["id"] for row in cur.fetchall()}

        session = get_session(year, round_num, sq_type, messages=True)
        quali_rows = session_to_quali_results(session)

        if not quali_rows:
            raise RuntimeError("Sprint Qualifying results not available yet — retry later")

        rows_to_upsert = []
        for row in quali_rows:
            code = row["driver_code"]
            driver_id = driver_map.get(code)
            if not driver_id:
                print(f"  [warn] Unknown driver: {code}")
                continue
            rows_to_upsert.append({
                "race_id": race_id,
                "driver_id": driver_id,
                "grid_position": row["grid_position"],
                "finish_position": None,
                "points": 0,
                "status": "grid_set",
                "total_sprint_time_ms": None,
                "fastest_lap": False,
                "sq1_time_ms": row["q1_time_ms"],
                "sq2_time_ms": row["q2_time_ms"],
                "sq3_time_ms": row["q3_time_ms"],
                "sq_sector1_ms": row["sector1_ms"],
                "sq_sector2_ms": row["sector2_ms"],
                "sq_sector3_ms": row["sector3_ms"],
                "sq_speed_st": row["speed_st"],
            })

        if not rows_to_upsert:
            raise RuntimeError(f"No SQ results for race {race_id} — all driver codes unknown")

        # Never overwrite sprint race finish data — only update grid/SQ columns
        upsert(conn, "sprint_results", rows_to_upsert, ["race_id", "driver_id"],
               exclude_update=["finish_position", "points", "status", "total_sprint_time_ms", "fastest_lap"])
        print(f"  Upserted {len(rows_to_upsert)} sprint grid rows from SQ (with lap times)")

        with conn.cursor() as cur:
            cur.execute(
                "UPDATE races SET status = 'sprint_qualifying_done' WHERE id = %s AND status = 'scheduled'",
                (race_id,),
            )
        conn.commit()
        print(f"  Race {race_id} status → sprint_qualifying_done")

    finally:
        conn.close()
