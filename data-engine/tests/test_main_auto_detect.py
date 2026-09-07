"""Covers main.py's auto-detect helpers: they each run one lookup, exit(1) when no
round matches, and otherwise return (year, round_number) coerced to int. Query params
and the status filter each helper keys on are pinned so a schedule-flow change can't
silently repoint them."""
from datetime import date
from unittest.mock import patch

import pytest

from src.main import auto_detect_race, auto_detect_sprint, auto_detect_sprint_qualifying
from tests.support.fake_db import FakeConnection


class TestAutoDetectRace:
    def test_returns_year_and_round_as_ints(self):
        conn = FakeConnection([{"round_number": "14", "year": "2025"}])
        assert auto_detect_race(2025, conn) == (2025, 14)

    def test_exits_1_when_no_upcoming_race(self):
        with pytest.raises(SystemExit) as exc:
            auto_detect_race(2025, FakeConnection([None]))
        assert exc.value.code == 1

    def test_query_filters_on_today_and_year_and_skips_done_rounds(self):
        conn = FakeConnection([{"round_number": 1, "year": 2025}])
        auto_detect_race(2025, conn)
        sql, params = conn.cursors[0].executed[0]
        assert params == (date.today(), 2025, 2025)
        assert "status NOT IN ('qualifying_done', 'completed')" in sql

    def test_year_none_passes_through_as_null_filter(self):
        conn = FakeConnection([{"round_number": 1, "year": 2025}])
        auto_detect_race(None, conn)
        _, params = conn.cursors[0].executed[0]
        assert params == (date.today(), None, None)


class TestAutoDetectSprintQualifying:
    def test_returns_round_for_scheduled_sprint_weekend(self):
        conn = FakeConnection([{"round_number": "6", "year": "2025"}])
        with patch("src.db.client.get_conn", return_value=conn):
            assert auto_detect_sprint_qualifying(2025) == (2025, 6)
        assert conn.closed is True

    def test_exits_1_when_no_sq_round(self):
        conn = FakeConnection([None])
        with patch("src.db.client.get_conn", return_value=conn), pytest.raises(SystemExit) as exc:
            auto_detect_sprint_qualifying(2025)
        assert exc.value.code == 1

    def test_keys_on_scheduled_status_and_sprint_qualifying_date(self):
        conn = FakeConnection([{"round_number": 6, "year": 2025}])
        with patch("src.db.client.get_conn", return_value=conn):
            auto_detect_sprint_qualifying(None)
        sql, params = conn.cursors[0].executed[0]
        assert "r.status = 'scheduled'" in sql
        assert "r.sprint_qualifying_date::date <= %s" in sql
        assert params == (date.today(), None, None)


class TestAutoDetectSprint:
    def test_returns_round_for_sprint_qualifying_done_weekend(self):
        conn = FakeConnection([{"round_number": "6", "year": "2025"}])
        with patch("src.db.client.get_conn", return_value=conn):
            assert auto_detect_sprint(2025) == (2025, 6)
        assert conn.closed is True

    def test_exits_1_when_no_sprint_race_ready(self):
        conn = FakeConnection([None])
        with patch("src.db.client.get_conn", return_value=conn), pytest.raises(SystemExit) as exc:
            auto_detect_sprint(2025)
        assert exc.value.code == 1

    def test_keys_on_sprint_qualifying_done_status_and_sprint_date(self):
        conn = FakeConnection([{"round_number": 6, "year": 2025}])
        with patch("src.db.client.get_conn", return_value=conn):
            auto_detect_sprint(2025)
        sql, _ = conn.cursors[0].executed[0]
        assert "r.status = 'sprint_qualifying_done'" in sql
        assert "r.sprint_date::date <= %s" in sql
