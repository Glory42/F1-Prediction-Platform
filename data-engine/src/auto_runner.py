import sys
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from enum import Enum
from typing import Any, Callable, Optional

import pandas as pd
import fastf1
from fastf1.core import DataNotLoadedError, InvalidSessionError, NoLapDataError
from src.db.client import get_conn
from src.utils.logging_utils import log_job_failure
from src.utils.schedule_window import race_weekend_window, RaceWeekendWindow

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
class RaceRunContext:
    race_id: int
    year: int
    round_number: int


@dataclass(frozen=True)
class JobStep:
    name: str
    run: Callable[[RaceRunContext], None]
    commits_status: Optional[str]


_ACTION_JOBS: dict[ActionKind, tuple[JobStep, ...]] = {
    ActionKind.SPRINT_QUALIFYING: (
        JobStep(
            "ingest_sprint_qualifying",
            lambda ctx: ingest_sprint_qualifying.run(ctx.year, ctx.round_number),
            "sprint_qualifying_done",
        ),
        JobStep("compute_sprint_features", lambda ctx: compute_sprint_features.run(ctx.race_id), None),
        JobStep("compute_sprint_predictions", lambda ctx: compute_sprint_predictions.run(ctx.race_id), None),
    ),
    ActionKind.SPRINT_RACE: (
        JobStep("ingest_sprint", lambda ctx: ingest_sprint.run(ctx.year, ctx.round_number), "sprint_done"),
        JobStep("compute_season_stats", lambda ctx: compute_season_stats.run(ctx.year), None),
    ),
    ActionKind.MAIN_QUALIFYING: (
        JobStep("ingest_qualifying", lambda ctx: ingest_qualifying.run(ctx.year, ctx.round_number), "qualifying_done"),
        JobStep("ingest_fp2", lambda ctx: ingest_fp2.run(ctx.year, ctx.round_number), None),
        JobStep("compute_features", lambda ctx: compute_features.run(ctx.race_id), None),
        JobStep("compute_predictions", lambda ctx: compute_predictions.run(ctx.race_id), None),
    ),
    ActionKind.MAIN_RACE: (
        JobStep("ingest_race", lambda ctx: ingest_race.run(ctx.year, ctx.round_number), "completed"),
        JobStep("compute_season_stats", lambda ctx: compute_season_stats.run(ctx.year), None),
    ),
}


@dataclass(frozen=True)
class Action:
    kind: ActionKind
    ready: bool
    label: str
    steps: tuple[JobStep, ...]


def _is_ready(session_date_utc: Any, delay_hours: float, now: datetime) -> bool:
    # FastF1 returns timezone-naive pandas Timestamps in UTC; None/NaT collapse to pd.NaT here.
    session_ts = pd.Timestamp(session_date_utc)
    if session_ts is pd.NaT:
        return False
    session_time = session_ts.to_pydatetime().replace(tzinfo=timezone.utc)
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
            steps=_ACTION_JOBS[ActionKind.SPRINT_QUALIFYING],
        )

    if is_sprint and status == "sprint_qualifying_done":
        return Action(
            kind=ActionKind.SPRINT_RACE,
            ready=_is_ready(event["Session3DateUtc"], delay_hours=1.5, now=now),
            label="Sprint Race",
            steps=_ACTION_JOBS[ActionKind.SPRINT_RACE],
        )

    if (not is_sprint and status == "scheduled") or (is_sprint and status == "sprint_done"):
        return Action(
            kind=ActionKind.MAIN_QUALIFYING,
            ready=_is_ready(event["Session4DateUtc"], delay_hours=2.0, now=now),
            label="Main Qualifying",
            steps=_ACTION_JOBS[ActionKind.MAIN_QUALIFYING],
        )

    if status == "qualifying_done":
        return Action(
            kind=ActionKind.MAIN_RACE,
            ready=_is_ready(event["Session5DateUtc"], delay_hours=3.0, now=now),
            label="Main Race",
            steps=_ACTION_JOBS[ActionKind.MAIN_RACE],
        )

    return None


@dataclass(frozen=True)
class StepOutcome:
    ok: bool
    last_committed_status: Optional[str]
    failed_step: Optional[str]
    error: Optional[Exception]


def _run_action_steps(action: Action, ctx: RaceRunContext) -> StepOutcome:
    """Runs an Action's job sequence in order, tracking how far it got.

    Each job commits its own status change (if any) in its own connection, independent of
    this function — so `last_committed_status` on failure reflects what's actually in the DB,
    letting `revert_race_status` avoid clobbering progress a later step in the sequence
    failed to build on.
    """
    last_committed_status: Optional[str] = None
    for step in action.steps:
        try:
            step.run(ctx)
        except Exception as e:
            return StepOutcome(ok=False, last_committed_status=last_committed_status, failed_step=step.name, error=e)
        if step.commits_status:
            last_committed_status = step.commits_status
    return StepOutcome(ok=True, last_committed_status=last_committed_status, failed_step=None, error=None)


def revert_race_status(
    conn_factory: Callable[[], Any],
    ctx: RaceRunContext,
    last_committed_status: Optional[str],
    pre_sequence_status: str,
    error: Exception,
    failed_step: str,
) -> None:
    """Shared failure handler for a job sequence: log the structured failure, then set the
    race status to whatever the sequence actually last committed (or the pre-sequence status
    if nothing did) so the next auto_runner cycle resumes from the right place.

    Opens its own connection rather than reusing run_cycle's — this fires after a job
    sequence that can run for minutes (FastF1 fetches), long enough for the long-lived
    shared connection to have gone stale; a fresh connection here keeps the revert write
    itself from failing.
    """
    log_job_failure(failed_step, error, race_id=ctx.race_id, year=ctx.year, round=ctx.round_number)
    target_status = last_committed_status if last_committed_status is not None else pre_sequence_status
    conn = conn_factory()
    try:
        with conn.cursor() as cur:
            cur.execute("UPDATE races SET status = %s WHERE id = %s", (target_status, ctx.race_id))
        conn.commit()
    finally:
        conn.close()


def _fp2_coverage(conn, race_id: int) -> float:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT COUNT(DISTINCT driver_id) AS n FROM fp2_long_run_times "
            "WHERE race_id = %s",
            (race_id,),
        )
        covered = cur.fetchone()["n"]
        cur.execute(
            "SELECT COUNT(*) AS n FROM qualifying_results WHERE race_id = %s",
            (race_id,),
        )
        expected = cur.fetchone()["n"]
    if not expected:
        return 1.0
    return covered / expected


def _backfill_fp2(log_func, conn, ctx: RaceRunContext) -> None:
    """
    Opportunistic FP2 catch-up while a race sits in `qualifying_done` before the
    main race. ingest_fp2 only runs once (during MAIN_QUALIFYING); if FastF1 did
    not have the session data yet it silently returned and was never retried.
    Each qualifying wait-cycle, if FP2 coverage is still below the model's 0.7
    fallback gate, retry the ingest and refresh features/predictions on success.
    """
    before = _fp2_coverage(conn, ctx.race_id)
    if before >= 0.7:
        return
    log_func(f"[auto_runner] FP2 coverage {before:.0%} — retrying FP2 + recompute while waiting for race")
    try:
        ingest_fp2.run(ctx.year, ctx.round_number)
        after = _fp2_coverage(conn, ctx.race_id)
        if after > before:
            compute_features.run(ctx.race_id)
            compute_predictions.run(ctx.race_id)
            log_func(f"[auto_runner] FP2 backfilled ({before:.0%} -> {after:.0%}); features/predictions refreshed")
        else:
            log_func(f"[auto_runner] FP2 still not available ({after:.0%}); will retry next cycle")
    except (DataNotLoadedError, InvalidSessionError, NoLapDataError) as e:
        log_func(f"[auto_runner] FP2 not ready yet: {e}")


ACTIVE_POLL_SECONDS = 20 * 60
IDLE_POLL_SECONDS = 6 * 60 * 60


def _default_schedule_fetcher(now_utc: datetime) -> "pd.DataFrame":
    return fastf1.get_event_schedule(now_utc.year, include_testing=False)


@dataclass(frozen=True)
class CycleResult:
    window: Optional[RaceWeekendWindow]
    schedule_available: bool


def poll_interval_for_window(
    window: Optional[RaceWeekendWindow],
    now_utc: datetime,
    *,
    schedule_available: bool = True,
) -> int:
    """How long the worker loop should sleep before the next auto_runner cycle:
    ACTIVE during a race-weekend window (or when the schedule couldn't be fetched at
    all — fail-safe, a transient FastF1 outage must not go quiet for IDLE_POLL_SECONDS
    during a live race weekend), IDLE otherwise."""
    if not schedule_available:
        return ACTIVE_POLL_SECONDS
    if window is not None and window.contains(now_utc):
        return ACTIVE_POLL_SECONDS
    return IDLE_POLL_SECONDS


def run_cycle(
    log_func: Callable[[str], None] = print,
    *,
    now_utc: Optional[datetime] = None,
    schedule_provider: Optional[Callable[[], "pd.DataFrame"]] = None,
    conn_factory: Callable[[], Any] = get_conn,
) -> CycleResult:
    log_func("[auto_runner] Waking up to check for pending F1 sessions...")

    now_utc = now_utc if now_utc is not None else datetime.now(timezone.utc)
    fetch = schedule_provider or (lambda: _default_schedule_fetcher(now_utc))

    try:
        schedule = fetch()
        schedule_available = True
    except Exception as e:
        # Fail-safe: a transient FastF1 outage must not skip a live race weekend.
        schedule = None
        schedule_available = False
        log_func(f"[auto_runner] Race-weekend gate schedule fetch failed ({e}); proceeding without the gate.")

    window = race_weekend_window(schedule, now_utc) if schedule is not None else None

    if schedule_available:
        if window is None or not window.contains(now_utc):
            detail = (
                f"next window opens {window.start:%Y-%m-%d %H:%MZ}"
                if window
                else "no upcoming race on the calendar"
            )
            log_func(f"[auto_runner] Outside a race-weekend window ({detail}); skipping the database check.")
            return CycleResult(window=window, schedule_available=True)

    conn = conn_factory()
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

        if not race_row:
            log_func("[auto_runner] No active races found. Exiting.")
            return CycleResult(window=window, schedule_available=schedule_available)

        ctx = RaceRunContext(
            race_id=race_row["id"],
            year=race_row["year"],
            round_number=race_row["round_number"],
        )
        status = race_row["status"]
        is_sprint = race_row["event_format"] in ["sprint", "sprint_qualifying", "sprint_shootout"]

        log_func(f"[auto_runner] Tracking {ctx.year} Round {ctx.round_number} (Status: {status})")

        # Reuse the schedule already fetched for the gate; only re-fetch if that fetch failed.
        if schedule is None:
            try:
                schedule = fetch()
                schedule_available = True
                window = race_weekend_window(schedule, now_utc)
            except Exception as e:
                log_func(f"[auto_runner] Failed to fetch schedule from FastF1: {e}")
                return CycleResult(window=None, schedule_available=False)

        try:
            event = schedule[schedule["RoundNumber"] == ctx.round_number].iloc[0]
        except Exception as e:
            log_func(f"[auto_runner] Failed to fetch schedule from FastF1: {e}")
            return CycleResult(window=window, schedule_available=schedule_available)

        try:
            action = decide_next_action(status=status, is_sprint=is_sprint, event=event, now=now_utc)

            if action is None:
                log_func(f"[auto_runner] Unhandled status '{status}'. Exiting.")
                return CycleResult(window=window, schedule_available=schedule_available)
            if not action.ready:
                # While the main race hasn't finished the wait window, opportunistically
                # backfill FP2 (see _backfill_fp2) so a missing-at-qualifying session
                # still lands before the race starts.
                if status == "qualifying_done" and action.kind == ActionKind.MAIN_RACE:
                    _backfill_fp2(log_func, conn, ctx)
                log_func(f"[auto_runner] {action.label} not finished yet or hasn't reached delay threshold. Exiting.")
                return CycleResult(window=window, schedule_available=schedule_available)
            else:
                log_func(f"[auto_runner] {action.label} time passed. Attempting ingestion...")
                outcome = _run_action_steps(action, ctx)
                if not outcome.ok:
                    log_func(f"[auto_runner] Error during {action.label} sequence: {outcome.error}. Reverting status.")
                    revert_race_status(
                        conn_factory, ctx, outcome.last_committed_status, status, outcome.error, outcome.failed_step
                    )
                    raise outcome.error
                log_func(f"[auto_runner] {action.label} ingestion completed successfully.")
                return CycleResult(window=window, schedule_available=schedule_available)

        except (DataNotLoadedError, InvalidSessionError, NoLapDataError, ValueError, RuntimeError) as e:
            log_func(f"[auto_runner] Data not ready from FastF1 yet. Will try again next hour. Details: {e}")
            return CycleResult(window=window, schedule_available=schedule_available)
        except Exception as e:
            # For unexpected errors, we want to fail so it shows up in Render logs
            log_func(f"[auto_runner] Unexpected error during execution: {e}")
            log_job_failure("auto_runner", e, race_id=ctx.race_id, year=ctx.year, round=ctx.round_number)
            raise
    finally:
        conn.close()

if __name__ == "__main__":
    run_cycle()
