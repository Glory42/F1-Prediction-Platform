from datetime import datetime, timedelta, timezone

from src.db.client import get_conn
from src.utils.driver_map import build_driver_number_map
from src.utils.openf1_client import fetch_overtakes, get_session_key
from src.utils.upsert import upsert

# Buffers from race start by a typical race duration + margin, since we don't track exact
# end time — errs toward waiting longer, never early enough to hit OpenF1's paid live window.
OPENF1_LIVE_WINDOW_BUFFER = timedelta(hours=3)


def run(year: int, round_num: int) -> None:
    print(f"[ingest_overtakes] year={year} round={round_num}")

    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT r.id, r.season_id, r.race_date, r.race_date_utc, r.status FROM races r "
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
        overtakes = fetch_overtakes(session_key)
        driver_map = build_driver_number_map(conn, race_row["season_id"])

        rows_to_upsert = []
        skipped = 0
        for o in overtakes:
            overtaking_id = driver_map.get(o["overtaking_driver_number"])
            overtaken_id = driver_map.get(o["overtaken_driver_number"])
            if overtaking_id is None or overtaken_id is None:
                skipped += 1
                continue
            rows_to_upsert.append({
                "race_id": race_id,
                "date": o["date"],
                "overtaking_driver_id": overtaking_id,
                "overtaken_driver_id": overtaken_id,
                "position": o["position"],
            })

        if rows_to_upsert:
            upsert(
                conn, "race_overtakes", rows_to_upsert,
                ["race_id", "date", "overtaking_driver_id", "overtaken_driver_id"],
            )
            print(f"  Upserted {len(rows_to_upsert)} overtakes ({skipped} skipped — unknown driver number)")
        else:
            print(f"  No overtakes upserted ({skipped} skipped — unknown driver number)")

        conn.commit()
    finally:
        conn.close()
