"""Backfills the ingest_team_radio job (OpenF1) for every completed race in a year range.
Usage: python scripts/backfill_team_radio.py 2023 2026"""
import random
import sys
import time

sys.path.insert(0, ".")

from src.db.client import get_conn
from src.jobs.ingest_team_radio import run as ingest_team_radio

# Each race makes 2 OpenF1 requests (sessions lookup + team_radio fetch). OpenF1's free
# tier allows 30 req/min, so this paces well under that (2 req / 5s = 24 req/min).
SLEEP_BETWEEN_RACES_S = 5.0


def safe(year: int, round_num: int) -> bool:
    max_retries = 3
    for attempt in range(max_retries):
        try:
            ingest_team_radio(year, round_num)
            return True
        except Exception as e:
            if attempt < max_retries - 1:
                backoff = 10 * (attempt + 1) + random.uniform(1.0, 3.0)
                print(f"  [WARN] {year} R{round_num} failed: {e}. Retrying in {backoff:.1f}s...")
                time.sleep(backoff)
            else:
                print(f"  [WARN] {year} R{round_num} failed after {max_retries} attempts: {e}")
    return False


def get_completed_races(start_year: int, end_year: int) -> list[tuple[int, int]]:
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT s.year, r.round_number FROM races r
                   JOIN seasons s ON r.season_id = s.id
                   WHERE s.year BETWEEN %s AND %s AND r.status = 'completed'
                   ORDER BY s.year, r.round_number""",
                (start_year, end_year),
            )
            return [(row["year"], row["round_number"]) for row in cur.fetchall()]
    finally:
        conn.close()


if __name__ == "__main__":
    start = int(sys.argv[1]) if len(sys.argv) > 1 else 2023
    end = int(sys.argv[2]) if len(sys.argv) > 2 else 2026

    races = get_completed_races(start, end)
    print(f"Backfilling team radio clips for {len(races)} completed races ({start}-{end})")

    ok, failed = 0, []
    for i, (year, round_num) in enumerate(races, 1):
        print(f"[{i}/{len(races)}] {year} R{round_num:02d}")
        if safe(year, round_num):
            ok += 1
        else:
            failed.append((year, round_num))
        if i < len(races):
            time.sleep(SLEEP_BETWEEN_RACES_S)

    print(f"\nDone: {ok}/{len(races)} succeeded")
    if failed:
        print(f"Failed: {failed}")
