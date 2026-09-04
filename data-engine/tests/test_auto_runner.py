from datetime import datetime, timedelta, timezone

import pandas as pd
import pytest

from src import auto_runner
from src.utils.schedule_window import RaceWeekendWindow
from tests.support.fake_db import FakeConnection


def _utc(year, month, day, hour=0, minute=0):
    return datetime(year, month, day, hour, minute, tzinfo=timezone.utc)


def _naive(dt):
    return pd.NaT if dt is None else pd.Timestamp(dt.replace(tzinfo=None))


def _schedule_with_race(round_number, race_utc):
    fp1 = race_utc - timedelta(days=2)
    return pd.DataFrame(
        [
            {
                "RoundNumber": round_number,
                "EventFormat": "conventional",
                "EventDate": _naive(race_utc),
                "Session1DateUtc": _naive(fp1),
                "Session2DateUtc": _naive(fp1 + timedelta(hours=4)),
                "Session3DateUtc": _naive(race_utc - timedelta(days=1, hours=3)),
                "Session4DateUtc": _naive(race_utc - timedelta(days=1)),
                "Session5DateUtc": _naive(race_utc),
            }
        ]
    )


class _SpyConnFactory:
    def __init__(self, conn=None):
        self.calls = 0
        self._conn = conn

    def __call__(self):
        self.calls += 1
        if self._conn is None:
            raise AssertionError("conn_factory was called but the test supplied no connection")
        return self._conn


class _SpyScheduleProvider:
    def __init__(self, schedule):
        self.calls = 0
        self._schedule = schedule

    def __call__(self):
        self.calls += 1
        return self._schedule


def _active_race_row(race_id=1, round_number=1, year=2026, status="scheduled", event_format="sprint"):
    return {"id": race_id, "round_number": round_number, "year": year, "status": status, "event_format": event_format}


class TestRunScheduleGate:
    def test_does_not_touch_the_database_outside_a_race_weekend(self):
        spy = _SpyConnFactory()
        race = _utc(2026, 3, 8, 4, 0)
        now = race - timedelta(days=4)  # window has not opened yet

        auto_runner.run_cycle(
            log_func=lambda *_: None,
            now_utc=now,
            schedule_provider=lambda: _schedule_with_race(1, race),
            conn_factory=spy,
        )

        assert spy.calls == 0

    def test_queries_the_database_when_inside_a_race_weekend(self):
        spy = _SpyConnFactory(FakeConnection([None]))  # no active race row -> run_cycle() exits cleanly
        race = _utc(2026, 3, 8, 4, 0)
        now = race - timedelta(hours=6)  # Saturday evening, well inside the window

        auto_runner.run_cycle(
            log_func=lambda *_: None,
            now_utc=now,
            schedule_provider=lambda: _schedule_with_race(1, race),
            conn_factory=spy,
        )

        assert spy.calls == 1

    def test_falls_back_to_checking_the_database_when_the_schedule_fetch_fails(self):
        spy = _SpyConnFactory(FakeConnection([None]))

        def _boom():
            raise RuntimeError("FastF1 unreachable")

        auto_runner.run_cycle(
            log_func=lambda *_: None,
            now_utc=_utc(2026, 3, 4, 12, 0),
            schedule_provider=_boom,
            conn_factory=spy,
        )

        assert spy.calls == 1

    def test_fetches_the_schedule_only_once_per_cycle(self):
        # The gate fetch and the session-time lookup must reuse the same schedule —
        # not each trigger their own fastf1.get_event_schedule() call.
        race = _utc(2026, 3, 8, 4, 0)
        now = race - timedelta(hours=6)
        provider = _SpyScheduleProvider(_schedule_with_race(1, race))
        conn = FakeConnection([_active_race_row(status="unhandled_status", event_format="conventional")])

        auto_runner.run_cycle(
            log_func=lambda *_: None,
            now_utc=now,
            schedule_provider=provider,
            conn_factory=lambda: conn,
        )

        assert provider.calls == 1


class TestPollIntervalForWindow:
    def test_active_when_now_is_inside_the_window(self):
        window = RaceWeekendWindow(round_number=1, start=_utc(2026, 3, 6), end=_utc(2026, 3, 9))
        secs = auto_runner.poll_interval_for_window(window, _utc(2026, 3, 8))
        assert secs == auto_runner.ACTIVE_POLL_SECONDS

    def test_idle_when_now_is_outside_the_window(self):
        window = RaceWeekendWindow(round_number=1, start=_utc(2026, 3, 6), end=_utc(2026, 3, 9))
        secs = auto_runner.poll_interval_for_window(window, _utc(2026, 2, 1))
        assert secs == auto_runner.IDLE_POLL_SECONDS

    def test_idle_when_there_is_no_window(self):
        secs = auto_runner.poll_interval_for_window(None, _utc(2026, 2, 1))
        assert secs == auto_runner.IDLE_POLL_SECONDS

    def test_active_when_schedule_was_unavailable(self):
        secs = auto_runner.poll_interval_for_window(None, _utc(2026, 2, 1), schedule_available=False)
        assert secs == auto_runner.ACTIVE_POLL_SECONDS


class TestDecideNextAction:
    _race = _utc(2026, 3, 8, 4, 0)
    _event = _schedule_with_race(1, _race).iloc[0]

    def test_sprint_scheduled_returns_sprint_qualifying(self):
        # Session2DateUtc + 1.5h delay has passed
        now = self._race - timedelta(days=2) + timedelta(hours=6)
        action = auto_runner.decide_next_action(status="scheduled", is_sprint=True, event=self._event, now=now)
        assert action.kind == auto_runner.ActionKind.SPRINT_QUALIFYING
        assert action.ready is True
        assert action.label == "Sprint Qualifying"
        assert action.steps is auto_runner._ACTION_JOBS[auto_runner.ActionKind.SPRINT_QUALIFYING]

    def test_sprint_after_qualifying_returns_sprint_race(self):
        # Session3DateUtc + 1.5h delay has NOT passed yet
        now = self._race - timedelta(days=1, hours=2)
        action = auto_runner.decide_next_action(
            status="sprint_qualifying_done", is_sprint=True, event=self._event, now=now
        )
        assert action.kind == auto_runner.ActionKind.SPRINT_RACE
        assert action.ready is False
        assert action.label == "Sprint Race"
        assert action.steps is auto_runner._ACTION_JOBS[auto_runner.ActionKind.SPRINT_RACE]

    def test_sprint_after_sprint_race_returns_main_qualifying(self):
        # Session4DateUtc + 2h delay has passed
        now = self._race - timedelta(days=1) + timedelta(hours=3)
        action = auto_runner.decide_next_action(status="sprint_done", is_sprint=True, event=self._event, now=now)
        assert action.kind == auto_runner.ActionKind.MAIN_QUALIFYING
        assert action.ready is True
        assert action.label == "Main Qualifying"
        assert action.steps is auto_runner._ACTION_JOBS[auto_runner.ActionKind.MAIN_QUALIFYING]

    def test_conventional_scheduled_returns_main_qualifying(self):
        # Session4DateUtc + 2h delay has NOT passed yet
        now = self._race - timedelta(days=1, hours=1)
        action = auto_runner.decide_next_action(status="scheduled", is_sprint=False, event=self._event, now=now)
        assert action.kind == auto_runner.ActionKind.MAIN_QUALIFYING
        assert action.ready is False
        assert action.label == "Main Qualifying"
        assert action.steps is auto_runner._ACTION_JOBS[auto_runner.ActionKind.MAIN_QUALIFYING]

    def test_qualifying_done_returns_main_race(self):
        # Session5DateUtc + 3h delay has passed
        now = self._race + timedelta(hours=4)
        action = auto_runner.decide_next_action(status="qualifying_done", is_sprint=False, event=self._event, now=now)
        assert action.kind == auto_runner.ActionKind.MAIN_RACE
        assert action.ready is True
        assert action.label == "Main Race"
        assert action.steps is auto_runner._ACTION_JOBS[auto_runner.ActionKind.MAIN_RACE]

    def test_unhandled_status_returns_none(self):
        action = auto_runner.decide_next_action(
            status="completed", is_sprint=False, event=self._event, now=self._race
        )
        assert action is None


class TestRunActionSteps:
    def test_all_steps_succeed_returns_ok_and_last_committed_status(self, monkeypatch):
        calls = []
        monkeypatch.setattr(auto_runner.ingest_sprint_qualifying, "run", lambda y, r: calls.append("ingest"))
        monkeypatch.setattr(auto_runner.compute_sprint_features, "run", lambda rid: calls.append("features"))
        monkeypatch.setattr(auto_runner.compute_sprint_predictions, "run", lambda rid: calls.append("predictions"))

        action = auto_runner.Action(
            kind=auto_runner.ActionKind.SPRINT_QUALIFYING,
            ready=True,
            label="Sprint Qualifying",
            steps=auto_runner._ACTION_JOBS[auto_runner.ActionKind.SPRINT_QUALIFYING],
        )
        ctx = auto_runner.RaceContext(race_id=1, year=2026, round_number=5)

        outcome = auto_runner._run_action_steps(action, ctx)

        assert outcome == auto_runner.StepOutcome(
            ok=True, last_committed_status="sprint_qualifying_done", failed_step=None, error=None
        )
        assert calls == ["ingest", "features", "predictions"]

    def test_step_failure_returns_last_committed_status_and_failed_step(self, monkeypatch):
        boom = RuntimeError("boom")

        def _raise(race_id):
            raise boom

        monkeypatch.setattr(auto_runner.ingest_sprint_qualifying, "run", lambda y, r: None)
        monkeypatch.setattr(auto_runner.compute_sprint_features, "run", _raise)
        monkeypatch.setattr(
            auto_runner.compute_sprint_predictions,
            "run",
            lambda rid: pytest.fail("should not run — the sequence must stop at the failing step"),
        )

        action = auto_runner.Action(
            kind=auto_runner.ActionKind.SPRINT_QUALIFYING,
            ready=True,
            label="Sprint Qualifying",
            steps=auto_runner._ACTION_JOBS[auto_runner.ActionKind.SPRINT_QUALIFYING],
        )
        ctx = auto_runner.RaceContext(race_id=1, year=2026, round_number=5)

        outcome = auto_runner._run_action_steps(action, ctx)

        assert outcome.ok is False
        assert outcome.last_committed_status == "sprint_qualifying_done"
        assert outcome.failed_step == "compute_sprint_features"
        assert outcome.error is boom


class TestRevertRaceStatus:
    def test_reverts_to_pre_sequence_status_when_nothing_committed(self):
        conn = FakeConnection([None])
        ctx = auto_runner.RaceContext(race_id=7, year=2026, round_number=3)

        auto_runner.revert_race_status(conn, ctx, None, "scheduled", RuntimeError("boom"), "ingest_sprint_qualifying")

        _, params = conn.cursors[-1].executed[-1]
        assert params == ("scheduled", 7)
        assert conn.commits == 1

    def test_reverts_to_last_committed_status_not_pre_sequence_status(self):
        conn = FakeConnection([None])
        ctx = auto_runner.RaceContext(race_id=7, year=2026, round_number=3)

        auto_runner.revert_race_status(
            conn, ctx, "sprint_qualifying_done", "scheduled", RuntimeError("boom"), "compute_sprint_features"
        )

        _, params = conn.cursors[-1].executed[-1]
        assert params == ("sprint_qualifying_done", 7)


class TestRunCycleSequenceRetry:
    def test_step_failure_mid_sequence_then_next_cycle_resumes_from_committed_status(self, monkeypatch):
        race = _utc(2026, 3, 8, 4, 0)
        now = race - timedelta(days=2) + timedelta(hours=6)  # Sprint Qualifying is ready

        monkeypatch.setattr(auto_runner.ingest_sprint_qualifying, "run", lambda y, r: None)

        def _raise(race_id):
            raise ConnectionError("boom")

        monkeypatch.setattr(auto_runner.compute_sprint_features, "run", _raise)
        monkeypatch.setattr(
            auto_runner.compute_sprint_predictions,
            "run",
            lambda rid: pytest.fail("should not run — compute_sprint_features already failed"),
        )

        conn = FakeConnection([_active_race_row(), None])

        with pytest.raises(ConnectionError, match="boom"):
            auto_runner.run_cycle(
                log_func=lambda *_: None,
                now_utc=now,
                schedule_provider=lambda: _schedule_with_race(1, race),
                conn_factory=lambda: conn,
            )

        # revert wrote the status the sequence actually committed (step 1), not the
        # pre-sequence "scheduled" value
        _, revert_params = conn.cursors[-1].executed[-1]
        assert revert_params == ("sprint_qualifying_done", 1)

        # the next cycle's decision resumes past the already-completed step instead
        # of redoing it
        event = _schedule_with_race(1, race).iloc[0]
        next_action = auto_runner.decide_next_action(
            status="sprint_qualifying_done", is_sprint=True, event=event, now=now
        )
        assert next_action.kind == auto_runner.ActionKind.SPRINT_RACE
