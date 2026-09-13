from datetime import datetime, timedelta, timezone

from src.db.client import get_conn
from src.utils.openf1_client import fetch_race_control, get_session_key
from src.utils.upsert import upsert

# Buffers from race start by a typical race duration + margin, since we don't track exact
# end time — errs toward waiting longer, never early enough to hit OpenF1's paid live window.
OPENF1_LIVE_WINDOW_BUFFER = timedelta(hours=3)


def run(year: int, round_num: int) -> None:
    print(f"[ingest_race_control] year={year} round={round_num}")

    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT r.id, r.race_date, r.race_date_utc, r.status FROM races r "
                "JOIN seasons s ON r.season_id = s.id "
                "WHERE s.year = %s AND r.round_number = %s",
                (year, round_num),
            )
            race_row = cur.fetchone()
        if not race_row:
            raise ValueError(f"Race not found for year={year} round={round_num}")

        race_id = race_row["id"]
        if race_row["status"] != "completed":
            print(f"  [SKIP] Race {race_id} is not 'completed' yet (status={race_row['status']})")
            return

        race_date_utc = race_row["race_date_utc"]
        if race_date_utc is not None and datetime.now(timezone.utc) - race_date_utc < OPENF1_LIVE_WINDOW_BUFFER:
            print(f"  [SKIP] Race {race_id} is still inside OpenF1's live-data window")
            return

        session_key = get_session_key(year, race_row["race_date"])
        messages = fetch_race_control(session_key)

        rows_to_upsert = [
            {
                "race_id": race_id,
                "date": m["date"],
                "category": m["category"],
                "flag": m.get("flag"),
                "lap_number": m.get("lap_number"),
                "driver_number": m.get("driver_number"),
                "scope": m.get("scope"),
                "sector": m.get("sector"),
                "message": m["message"],
            }
            for m in messages
        ]

        if rows_to_upsert:
            upsert(conn, "race_control_messages", rows_to_upsert, ["race_id", "date", "message"])
            print(f"  Upserted {len(rows_to_upsert)} race control messages")
        else:
            print("  No race control messages returned")

        conn.commit()
    finally:
        conn.close()
