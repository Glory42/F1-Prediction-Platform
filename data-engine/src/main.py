import argparse
import sys
import json
from datetime import date

import src.config  # noqa: F401 — triggers FastF1 cache setup


def auto_detect_race(year: int | None, conn) -> tuple[int, int]:
    """Find the next scheduled/qualifying_done race at or before today."""
    from src.db.client import get_conn
    conn = conn or get_conn()
    today = date.today()
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT r.round_number, s.year FROM races r
            JOIN seasons s ON r.season_id = s.id
            WHERE r.race_date <= %s AND r.status != 'completed'
              AND (%s IS NULL OR s.year = %s)
            ORDER BY r.race_date DESC
            LIMIT 1
            """,
            (today, year, year),
        )
        row = cur.fetchone()
    if not row:
        print("[auto-detect] No upcoming race found", file=sys.stderr)
        sys.exit(1)
    return int(row["year"]), int(row["round_number"])


def main() -> None:
    parser = argparse.ArgumentParser(description="F1 Intelligence Data Engine")
    parser.add_argument("--job", required=True, choices=[
        "sync_schedule",
        "sync_season",
        "ingest_qualifying",
        "ingest_race",
        "compute_season_stats",
        "compute_features",
        "compute_predictions",
    ])
    parser.add_argument("--year", type=int, help="Season year (e.g. 2025)")
    parser.add_argument("--round", type=int, dest="round_num", help="Race round number")
    parser.add_argument("--race_id", type=int, help="Race DB id (for feature/prediction jobs)")
    args = parser.parse_args()

    job = args.job

    if job == "sync_schedule":
        if not args.year:
            print("--year required for sync_schedule", file=sys.stderr)
            sys.exit(1)
        from src.jobs.sync_schedule import run
        run(args.year)

    elif job == "sync_season":
        if not args.year:
            print("--year required for sync_season", file=sys.stderr)
            sys.exit(1)
        round_num = args.round_num or 1
        from src.jobs.sync_season import run
        run(args.year, round_num)

    elif job == "ingest_qualifying":
        from src.db.client import get_conn
        conn = get_conn()
        year, round_num = (args.year, args.round_num) if args.year and args.round_num \
            else auto_detect_race(args.year, conn)
        conn.close()
        from src.jobs.ingest_qualifying import run
        run(year, round_num)

    elif job == "ingest_race":
        from src.db.client import get_conn
        conn = get_conn()
        year, round_num = (args.year, args.round_num) if args.year and args.round_num \
            else auto_detect_race(args.year, conn)
        conn.close()
        from src.jobs.ingest_race import run
        run(year, round_num)

    elif job == "compute_season_stats":
        if not args.year:
            print("--year required for compute_season_stats", file=sys.stderr)
            sys.exit(1)
        from src.jobs.compute_season_stats import run
        run(args.year)

    elif job == "compute_features":
        if not args.race_id:
            print("--race_id required for compute_features", file=sys.stderr)
            sys.exit(1)
        from src.jobs.compute_features import run
        run(args.race_id)

    elif job == "compute_predictions":
        if not args.race_id:
            print("--race_id required for compute_predictions", file=sys.stderr)
            sys.exit(1)
        from src.jobs.compute_predictions import run
        run(args.race_id)


if __name__ == "__main__":
    main()
