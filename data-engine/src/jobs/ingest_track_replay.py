import time
from datetime import datetime, timedelta, timezone

from src.db.client import get_conn
from src.utils.driver_map import build_driver_number_map
from src.utils.openf1_client import fetch_location, get_session_key
from src.utils.upsert import upsert

# Buffers from race start by a typical race duration + margin, since we don't track exact
# end time — errs toward waiting longer, never early enough to hit OpenF1's paid live window.
OPENF1_LIVE_WINDOW_BUFFER = timedelta(hours=3)

# OpenF1 samples at ~3.7Hz — a full race is ~40-50k raw points per driver, far more than a
# visual replay needs. Keeping one point per this interval cuts that by ~5-7x before storage.
DOWNSAMPLE_INTERVAL_S = 2.0

# location requires one call per driver (a bare session_key is rejected), and each response
# is several MB unfiltered — paced under OpenF1's free-tier 30 req/min across a ~20-driver race.
_PER_DRIVER_DELAY_S = 2.0
_MAX_RETRIES = 3


def _fetch_location_with_retries(session_key: int, driver_number: int) -> list[dict] | None:
    """Individual driver failures shouldn't sink the whole race — OpenF1's free tier
    occasionally rejects a request under load; skip that driver rather than crash."""
    for attempt in range(_MAX_RETRIES):
        try:
            return fetch_location(session_key, driver_number)
        except Exception as e:
            if attempt < _MAX_RETRIES - 1:
                backoff = 5 * (attempt + 1)
                print(f"  [WARN] driver_number={driver_number} fetch failed: {e}. Retrying in {backoff}s...")
                time.sleep(backoff)
            else:
                print(f"  [WARN] driver_number={driver_number} fetch failed after {_MAX_RETRIES} attempts: {e}")
    return None


def _downsample(points: list[dict], interval_s: float = DOWNSAMPLE_INTERVAL_S) -> list[dict]:
    if not points:
        return []
    kept = [points[0]]
    last_kept_time = datetime.fromisoformat(points[0]["date"])
    threshold = timedelta(seconds=interval_s)
    for p in points[1:]:
        t = datetime.fromisoformat(p["date"])
        if t - last_kept_time >= threshold:
            kept.append(p)
            last_kept_time = t
    return kept


def run(year: int, round_num: int) -> None:
    print(f"[ingest_track_replay] year={year} round={round_num}")

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
        driver_map = build_driver_number_map(conn, race_row["season_id"])

        rows_to_upsert = []
        failed_drivers = []
        for i, (driver_number, driver_id) in enumerate(driver_map.items()):
            points = _fetch_location_with_retries(session_key, driver_number)
            if points is None:
                failed_drivers.append(driver_number)
            else:
                for p in _downsample(points):
                    rows_to_upsert.append({
                        "race_id": race_id,
                        "driver_id": driver_id,
                        "date": p["date"],
                        "x": p["x"],
                        "y": p["y"],
                    })
            if i < len(driver_map) - 1:
                time.sleep(_PER_DRIVER_DELAY_S)

        if rows_to_upsert:
            upsert(conn, "track_locations", rows_to_upsert, ["race_id", "driver_id", "date"])
            print(f"  Upserted {len(rows_to_upsert)} downsampled location points across "
                  f"{len(driver_map) - len(failed_drivers)}/{len(driver_map)} drivers")
        else:
            print("  No location points upserted")
        if failed_drivers:
            print(f"  [WARN] {len(failed_drivers)} driver(s) skipped after retries: {failed_drivers}")

        conn.commit()
    finally:
        conn.close()
