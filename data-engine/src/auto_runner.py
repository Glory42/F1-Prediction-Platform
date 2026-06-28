import sys
from datetime import datetime, timezone, timedelta
import fastf1
from fastf1.core import DataNotLoadedError, InvalidSessionError, NoLapDataError
from src.db.client import get_conn

# Import jobs
from src.jobs import (
    ingest_sprint_qualifying,
    compute_sprint_features,
    compute_sprint_predictions,
    ingest_sprint,
    compute_season_stats,
    ingest_qualifying,
    ingest_fp2,
    compute_features,
    compute_predictions,
    ingest_race,
)

def run(log_func=print):
    log_func("[auto_runner] Waking up to check for pending F1 sessions...")
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            # Find the most recent active race
            cur.execute(
                """
                SELECT r.id, r.round_number, s.year, r.status, r.event_format
                FROM races r
                JOIN seasons s ON r.season_id = s.id
                WHERE r.status != 'completed'
                ORDER BY r.race_date ASC
                LIMIT 1
                """
            )
            race_row = cur.fetchone()
    finally:
        conn.close()

    if not race_row:
        log_func("[auto_runner] No active races found. Exiting.")
        return

    race_id = race_row["id"]
    year = race_row["year"]
    round_number = race_row["round_number"]
    status = race_row["status"]
    is_sprint = race_row["event_format"] in ["sprint", "sprint_qualifying", "sprint_shootout"]

    log_func(f"[auto_runner] Tracking {year} Round {round_number} (Status: {status})")

    # Fetch the official F1 schedule to get exact UTC session times
    try:
        schedule = fastf1.get_event_schedule(year, include_testing=False)
        event = schedule[schedule["RoundNumber"] == round_number].iloc[0]
    except Exception as e:
        log_func(f"[auto_runner] Failed to fetch schedule from FastF1: {e}")
        return

    now_utc = datetime.now(timezone.utc)

    # Helper function to check if enough time has passed since a session
    def is_ready(session_date_utc, delay_hours):
        if pd.isna(session_date_utc):
            return False
        # FastF1 returns timezone-naive pandas Timestamps in UTC, convert to timezone-aware UTC datetime
        session_time = session_date_utc.to_pydatetime().replace(tzinfo=timezone.utc)
        return now_utc >= session_time + timedelta(hours=delay_hours)

    import pandas as pd

    try:
        # State machine based on current status
        if is_sprint and status == 'scheduled':
            # Waiting for Sprint Qualifying (Session 2)
            if is_ready(event["Session2DateUtc"], delay_hours=1.5):
                log_func("[auto_runner] Sprint Qualifying time passed. Attempting ingestion...")
                try:
                    ingest_sprint_qualifying.run(year, round_number)
                    compute_sprint_features.run(race_id)
                    compute_sprint_predictions.run(race_id)
                    log_func("[auto_runner] Sprint Qualifying ingestion completed successfully.")
                except Exception as e:
                    log_func(f"[auto_runner] Error during Sprint Qualifying sequence: {e}. Reverting status.")
                    conn = get_conn()
                    try:
                        with conn.cursor() as cur:
                            cur.execute("UPDATE races SET status = %s WHERE id = %s", (status, race_id))
                        conn.commit()
                    finally:
                        conn.close()
                    raise
            else:
                log_func("[auto_runner] Sprint Qualifying not finished yet or hasn't reached delay threshold. Exiting.")

        elif is_sprint and status == 'sprint_qualifying_done':
            # Waiting for Sprint Race (Session 3)
            if is_ready(event["Session3DateUtc"], delay_hours=1.5):
                log_func("[auto_runner] Sprint Race time passed. Attempting ingestion...")
                try:
                    ingest_sprint.run(year, round_number)
                    compute_season_stats.run(year)
                    log_func("[auto_runner] Sprint Race ingestion completed successfully.")
                except Exception as e:
                    log_func(f"[auto_runner] Error during Sprint Race sequence: {e}. Reverting status.")
                    conn = get_conn()
                    try:
                        with conn.cursor() as cur:
                            cur.execute("UPDATE races SET status = %s WHERE id = %s", (status, race_id))
                        conn.commit()
                    finally:
                        conn.close()
                    raise
            else:
                log_func("[auto_runner] Sprint Race not finished yet or hasn't reached delay threshold. Exiting.")

        elif (not is_sprint and status == 'scheduled') or (is_sprint and status == 'sprint_done'):
            # Waiting for Main Qualifying (Session 4)
            if is_ready(event["Session4DateUtc"], delay_hours=2.0):
                log_func("[auto_runner] Main Qualifying time passed. Attempting ingestion...")
                try:
                    ingest_qualifying.run(year, round_number)
                    ingest_fp2.run(year, round_number)
                    compute_features.run(race_id)
                    compute_predictions.run(race_id)
                    log_func("[auto_runner] Main Qualifying ingestion completed successfully.")
                except Exception as e:
                    log_func(f"[auto_runner] Error during Main Qualifying sequence: {e}. Reverting status.")
                    conn = get_conn()
                    try:
                        with conn.cursor() as cur:
                            cur.execute("UPDATE races SET status = %s WHERE id = %s", (status, race_id))
                        conn.commit()
                    finally:
                        conn.close()
                    raise
            else:
                log_func("[auto_runner] Main Qualifying not finished yet or hasn't reached delay threshold. Exiting.")

        elif status == 'qualifying_done':
            # Waiting for Main Race (Session 5)
            if is_ready(event["Session5DateUtc"], delay_hours=3.0):
                log_func("[auto_runner] Main Race time passed. Attempting ingestion...")
                try:
                    ingest_race.run(year, round_number)
                    compute_season_stats.run(year)
                    log_func("[auto_runner] Main Race ingestion completed successfully.")
                except Exception as e:
                    log_func(f"[auto_runner] Error during Main Race sequence: {e}. Reverting status.")
                    conn = get_conn()
                    try:
                        with conn.cursor() as cur:
                            cur.execute("UPDATE races SET status = %s WHERE id = %s", (status, race_id))
                        conn.commit()
                    finally:
                        conn.close()
                    raise
            else:
                log_func("[auto_runner] Main Race not finished yet or hasn't reached delay threshold. Exiting.")

        else:
            log_func(f"[auto_runner] Unhandled status '{status}'. Exiting.")

    except (DataNotLoadedError, InvalidSessionError, NoLapDataError, ValueError) as e:
        log_func(f"[auto_runner] Data not ready from FastF1 yet. Will try again next hour. Details: {e}")
        return
    except Exception as e:
        # For unexpected errors, we want to fail so it shows up in Render logs
        log_func(f"[auto_runner] Unexpected error during execution: {e}")
        raise

if __name__ == "__main__":
    run()
