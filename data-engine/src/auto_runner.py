import sys
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from enum import Enum
from typing import Callable, Optional

import pandas as pd
import fastf1
from fastf1.core import DataNotLoadedError, InvalidSessionError, NoLapDataError
from src.db.client import get_conn
from src.utils.logging_utils import log_job_failure

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


class ActionKind(str, Enum):
    SPRINT_QUALIFYING = "sprint_qualifying"
    SPRINT_RACE = "sprint_race"
    MAIN_QUALIFYING = "main_qualifying"
    MAIN_RACE = "main_race"


@dataclass(frozen=True)
class Action:
    kind: ActionKind
    ready: bool
    label: str
    job_name: str


def _is_ready(session_date_utc: Optional[pd.Timestamp], delay_hours: float, now: datetime) -> bool:
    if pd.isna(session_date_utc):
        return False
    # FastF1 returns timezone-naive pandas Timestamps in UTC, convert to timezone-aware UTC datetime
    session_time = session_date_utc.to_pydatetime().replace(tzinfo=timezone.utc)
    return now >= session_time + timedelta(hours=delay_hours)


def decide_next_action(status: str, is_sprint: bool, event: pd.Series, now: datetime) -> Optional[Action]:
    """Pure decision: given the current race status and schedule row, what should run next.

    Does no I/O — takes already-fetched schedule/status data so it can be tested with
    fake inputs, without mocking FastF1 or a live DB connection.
    """
    if is_sprint and status == "scheduled":
        return Action(
            kind=ActionKind.SPRINT_QUALIFYING,
            ready=_is_ready(event["Session2DateUtc"], delay_hours=1.5, now=now),
            label="Sprint Qualifying",
            job_name="ingest_sprint_qualifying",
        )

    if is_sprint and status == "sprint_qualifying_done":
        return Action(
            kind=ActionKind.SPRINT_RACE,
            ready=_is_ready(event["Session3DateUtc"], delay_hours=1.5, now=now),
            label="Sprint Race",
            job_name="ingest_sprint",
        )

    if (not is_sprint and status == "scheduled") or (is_sprint and status == "sprint_done"):
        return Action(
            kind=ActionKind.MAIN_QUALIFYING,
            ready=_is_ready(event["Session4DateUtc"], delay_hours=2.0, now=now),
            label="Main Qualifying",
            job_name="ingest_qualifying",
        )

    if status == "qualifying_done":
        return Action(
            kind=ActionKind.MAIN_RACE,
            ready=_is_ready(event["Session5DateUtc"], delay_hours=3.0, now=now),
            label="Main Race",
            job_name="ingest_race",
        )

    return None


def revert_race_status(race_id: int, status: str, error: Exception, job_name: str, year: int, round_number: int) -> None:
    """Shared failure handler for a job sequence: log the structured failure, then revert
    the race back to its prior status so the next auto_runner cycle retries it."""
    log_job_failure(job_name, error, race_id=race_id, year=year, round=round_number)
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("UPDATE races SET status = %s WHERE id = %s", (status, race_id))
        conn.commit()
    finally:
        conn.close()


def _run_action(action: Action, race_id: int, year: int, round_number: int) -> None:
    if action.kind == ActionKind.SPRINT_QUALIFYING:
        ingest_sprint_qualifying.run(year, round_number)
        compute_sprint_features.run(race_id)
        compute_sprint_predictions.run(race_id)
    elif action.kind == ActionKind.SPRINT_RACE:
        ingest_sprint.run(year, round_number)
        compute_season_stats.run(year)
    elif action.kind == ActionKind.MAIN_QUALIFYING:
        ingest_qualifying.run(year, round_number)
        ingest_fp2.run(year, round_number)
        compute_features.run(race_id)
        compute_predictions.run(race_id)
    elif action.kind == ActionKind.MAIN_RACE:
        ingest_race.run(year, round_number)
        compute_season_stats.run(year)


def run(log_func: Callable[[str], None] = print) -> None:
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
                WHERE r.status != 'completed' AND s.year >= EXTRACT(YEAR FROM CURRENT_DATE)
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

    try:
        action = decide_next_action(status=status, is_sprint=is_sprint, event=event, now=now_utc)

        if action is None:
            log_func(f"[auto_runner] Unhandled status '{status}'. Exiting.")
        elif not action.ready:
            log_func(f"[auto_runner] {action.label} not finished yet or hasn't reached delay threshold. Exiting.")
        else:
            log_func(f"[auto_runner] {action.label} time passed. Attempting ingestion...")
            try:
                _run_action(action, race_id=race_id, year=year, round_number=round_number)
                log_func(f"[auto_runner] {action.label} ingestion completed successfully.")
            except Exception as e:
                log_func(f"[auto_runner] Error during {action.label} sequence: {e}. Reverting status.")
                revert_race_status(race_id, status, e, action.job_name, year, round_number)
                raise

    except (DataNotLoadedError, InvalidSessionError, NoLapDataError, ValueError, RuntimeError) as e:
        log_func(f"[auto_runner] Data not ready from FastF1 yet. Will try again next hour. Details: {e}")
        return
    except Exception as e:
        # For unexpected errors, we want to fail so it shows up in Render logs
        log_func(f"[auto_runner] Unexpected error during execution: {e}")
        log_job_failure("auto_runner", e, race_id=race_id, year=year, round=round_number)
        raise

if __name__ == "__main__":
    run()
