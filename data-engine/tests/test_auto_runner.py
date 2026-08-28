from datetime import datetime, timedelta, timezone

import pandas as pd

from src import auto_runner
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


class TestRunScheduleGate:
    def test_does_not_touch_the_database_outside_a_race_weekend(self):
        spy = _SpyConnFactory()
        race = _utc(2026, 3, 8, 4, 0)
        now = race - timedelta(days=4)  # window has not opened yet

        auto_runner.run(
            log_func=lambda *_: None,
            now_utc=now,
            fetch_schedule=lambda: _schedule_with_race(1, race),
            conn_factory=spy,
        )

        assert spy.calls == 0

    def test_queries_the_database_when_inside_a_race_weekend(self):
        spy = _SpyConnFactory(FakeConnection([None]))  # no active race row -> run() exits cleanly
        race = _utc(2026, 3, 8, 4, 0)
        now = race - timedelta(hours=6)  # Saturday evening, well inside the window

        auto_runner.run(
            log_func=lambda *_: None,
            now_utc=now,
            fetch_schedule=lambda: _schedule_with_race(1, race),
            conn_factory=spy,
        )

        assert spy.calls == 1

    def test_short_interval_during_a_race_weekend(self):
        race = _utc(2026, 3, 8, 4, 0)
        secs = auto_runner.next_poll_interval_seconds(
            now_utc=race - timedelta(hours=6),
            fetch_schedule=lambda: _schedule_with_race(1, race),
        )
        assert secs == auto_runner.ACTIVE_POLL_SECONDS

    def test_long_interval_when_no_race_is_near(self):
        race = _utc(2026, 3, 8, 4, 0)
        secs = auto_runner.next_poll_interval_seconds(
            now_utc=race - timedelta(days=10),
            fetch_schedule=lambda: _schedule_with_race(1, race),
        )
        assert secs == auto_runner.IDLE_POLL_SECONDS

    def test_short_interval_when_the_schedule_fetch_fails(self):
        def _boom():
            raise RuntimeError("FastF1 unreachable")

        secs = auto_runner.next_poll_interval_seconds(now_utc=_utc(2026, 3, 4), fetch_schedule=_boom)

        assert secs == auto_runner.ACTIVE_POLL_SECONDS

    def test_falls_back_to_checking_the_database_when_the_schedule_fetch_fails(self):
        spy = _SpyConnFactory(FakeConnection([None]))

        def _boom():
            raise RuntimeError("FastF1 unreachable")

        auto_runner.run(
            log_func=lambda *_: None,
            now_utc=_utc(2026, 3, 4, 12, 0),
            fetch_schedule=_boom,
            conn_factory=spy,
        )

        assert spy.calls == 1
