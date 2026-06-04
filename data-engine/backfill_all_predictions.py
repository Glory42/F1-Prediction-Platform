"""
Full prediction recompute — weighted-v3 (GP) and sprint-v2 (sprint).

Covers:
  - Every race that has qualifying_results (GP predictions)
  - Every sprint weekend that has sprint_results (sprint predictions)

Run from data-engine/:
    source venv/bin/activate
    python backfill_all_predictions.py
"""
import sys
import time
import psycopg2
import psycopg2.extras
from src.config import DATABASE_URL
from src.jobs import compute_features, compute_predictions
from src.jobs import compute_sprint_features, compute_sprint_predictions


def get_conn():
    conn = psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)
    conn.autocommit = True
    return conn


def main():
    conn = get_conn()

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT DISTINCT qr.race_id
            FROM qualifying_results qr
            ORDER BY qr.race_id
            """
        )
        gp_race_ids = [r["race_id"] for r in cur.fetchall()]

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT DISTINCT sr.race_id
            FROM sprint_results sr
            ORDER BY sr.race_id
            """
        )
        sprint_race_ids = [r["race_id"] for r in cur.fetchall()]

    conn.close()

    gp_total     = len(gp_race_ids)
    sprint_total = len(sprint_race_ids)
    print(f"GP predictions:     {gp_total} races")
    print(f"Sprint predictions: {sprint_total} races")
    print(f"Total:              {gp_total + sprint_total} compute jobs\n")

    gp_errors     = []
    sprint_errors = []

    print("── GP predictions (weighted-v3) ──────────────────────────────")
    for i, race_id in enumerate(gp_race_ids, 1):
        t0 = time.time()
        try:
            compute_features.run(race_id)
            compute_predictions.run(race_id)
            elapsed = time.time() - t0
            print(f"  [{i}/{gp_total}] race {race_id} done in {elapsed:.1f}s")
        except Exception as exc:
            elapsed = time.time() - t0
            print(f"  [{i}/{gp_total}] race {race_id} FAILED ({elapsed:.1f}s): {exc}", file=sys.stderr)
            gp_errors.append((race_id, str(exc)))

    print("\n── Sprint predictions (sprint-v2) ────────────────────────────")
    for i, race_id in enumerate(sprint_race_ids, 1):
        t0 = time.time()
        try:
            compute_sprint_features.run(race_id)
            compute_sprint_predictions.run(race_id)
            elapsed = time.time() - t0
            print(f"  [{i}/{sprint_total}] sprint race {race_id} done in {elapsed:.1f}s")
        except Exception as exc:
            elapsed = time.time() - t0
            print(f"  [{i}/{sprint_total}] sprint race {race_id} FAILED ({elapsed:.1f}s): {exc}", file=sys.stderr)
            sprint_errors.append((race_id, str(exc)))

    total_errors = len(gp_errors) + len(sprint_errors)
    total_ok     = (gp_total + sprint_total) - total_errors
    print(f"\n{'='*60}")
    print(f"Done. {total_ok} succeeded, {total_errors} failed.")
    if gp_errors:
        print(f"GP failures:     {[r for r, _ in gp_errors]}")
    if sprint_errors:
        print(f"Sprint failures: {[r for r, _ in sprint_errors]}")


if __name__ == "__main__":
    main()
