"""Covers sync_schedule: the FastF1 timestamp coercion helper and run()'s circuit-key
resolution (including the Madrid/Spielberg year overrides), sprint-session date wiring,
skip-on-unmapped behaviour, and the status-preserving upsert call. FastF1, the DB
connection and upsert are all mocked."""
from unittest.mock import patch

import pandas as pd
import pytest

from src.jobs import sync_schedule
from src.jobs.sync_schedule import _to_utc_iso, run
from tests.support.fake_db import FakeConnection

_CIRCUITS = [
    {"id": 10, "circuit_key": "catalunya"},
    {"id": 11, "circuit_key": "madrid"},
    {"id": 12, "circuit_key": "jarama"},
    {"id": 13, "circuit_key": "red_bull_ring"},
    {"id": 14, "circuit_key": "a1_ring"},
    {"id": 15, "circuit_key": "interlagos"},
]


def _ts(s):
    return pd.Timestamp(s)


def _event(round_number, name, location, *, fmt="conventional",
           s2=None, s3=None, s4="2025-06-14T13:00:00", s5="2025-06-15T13:00:00",
           event_date="2025-06-15"):
    return {
        "RoundNumber": round_number,
        "EventName": name,
        "Location": location,
        "EventFormat": fmt,
        "EventDate": _ts(event_date),
        "Session2DateUtc": _ts(s2) if s2 else pd.NaT,
        "Session3DateUtc": _ts(s3) if s3 else pd.NaT,
        "Session4DateUtc": _ts(s4) if s4 else pd.NaT,
        "Session5DateUtc": _ts(s5) if s5 else pd.NaT,
    }


def _run(events, *, year=2025, season_row={"id": 1}):
    conn = FakeConnection([season_row, list(_CIRCUITS)])
    schedule = pd.DataFrame(events)
    with patch.object(sync_schedule.fastf1, "get_event_schedule", return_value=schedule), \
         patch.object(sync_schedule, "get_conn", return_value=conn), \
         patch.object(sync_schedule, "upsert") as mock_upsert:
        run(year)
    return conn, mock_upsert


class TestToUtcIso:
    def test_none_and_nat_become_none(self):
        assert _to_utc_iso(None) is None
        assert _to_utc_iso(pd.NaT) is None

    def test_timestamp_is_rendered_iso(self):
        assert _to_utc_iso(pd.Timestamp("2025-06-14T13:00:00")) == "2025-06-14T13:00:00"

    def test_value_without_isoformat_is_swallowed_to_none(self):
        assert _to_utc_iso(42) is None


class TestRun:
    def test_missing_season_raises(self):
        with pytest.raises(ValueError, match="Season 2025 not found"):
            _run([_event(1, "Spanish GP", "Barcelona")], season_row=None)

    def test_conventional_event_builds_a_scheduled_row(self):
        _, mock_upsert = _run([_event(1, "Spanish Grand Prix", "Barcelona")])
        conn_arg, table, rows, conflict = mock_upsert.call_args.args
        assert table == "races"
        assert conflict == ["season_id", "round_number"]
        assert mock_upsert.call_args.kwargs["exclude_update"] == ["status"]
        assert len(rows) == 1
        row = rows[0]
        assert row["circuit_id"] == 10
        assert row["round_number"] == 1
        assert row["status"] == "scheduled"
        assert row["race_date"] == "2025-06-15"
        assert row["qualifying_date"] == "2025-06-14T13:00:00"
        assert row["race_date_utc"] == "2025-06-15T13:00:00"
        assert row["sprint_date"] is None
        assert row["sprint_qualifying_date"] is None

    def test_sprint_event_wires_sprint_session_dates(self):
        _, mock_upsert = _run([_event(
            1, "São Paulo Grand Prix", "Interlagos", fmt="sprint_qualifying",
            s2="2025-11-07T18:00:00", s3="2025-11-08T14:00:00",
        )])
        row = mock_upsert.call_args.args[2][0]
        assert row["event_format"] == "sprint_qualifying"
        assert row["sprint_qualifying_date"] == "2025-11-07T18:00:00"
        assert row["sprint_date"] == "2025-11-08T14:00:00"

    def test_madrid_maps_to_jarama_before_2026(self):
        _, mock_upsert = _run([_event(1, "Spanish GP", "Madrid")], year=2025)
        assert mock_upsert.call_args.args[2][0]["circuit_id"] == 12  # jarama

    def test_madrid_maps_to_madrid_from_2026(self):
        _, mock_upsert = _run([_event(1, "Madrid GP", "Madrid")], year=2026)
        assert mock_upsert.call_args.args[2][0]["circuit_id"] == 11  # madrid

    def test_spielberg_maps_to_a1_ring_before_2014(self):
        _, mock_upsert = _run([_event(1, "Austrian GP", "Spielberg")], year=2003)
        assert mock_upsert.call_args.args[2][0]["circuit_id"] == 14  # a1_ring

    def test_spielberg_maps_to_red_bull_ring_from_2014(self):
        _, mock_upsert = _run([_event(1, "Austrian GP", "Spielberg")], year=2024)
        assert mock_upsert.call_args.args[2][0]["circuit_id"] == 13  # red_bull_ring

    def test_unmapped_location_is_skipped(self):
        _, mock_upsert = _run([
            _event(1, "Real GP", "Barcelona"),
            _event(2, "Fake GP", "Atlantis"),
        ])
        rows = mock_upsert.call_args.args[2]
        assert [r["round_number"] for r in rows] == [1]

    def test_mapped_location_absent_from_circuits_table_is_skipped(self):
        conn = FakeConnection([{"id": 1}, [{"id": 10, "circuit_key": "catalunya"}]])
        schedule = pd.DataFrame([_event(1, "São Paulo GP", "Interlagos")])
        with patch.object(sync_schedule.fastf1, "get_event_schedule", return_value=schedule), \
             patch.object(sync_schedule, "get_conn", return_value=conn), \
             patch.object(sync_schedule, "upsert") as mock_upsert:
            run(2025)
        mock_upsert.assert_not_called()

    def test_nothing_to_upsert_never_calls_upsert(self):
        _, mock_upsert = _run([_event(1, "Fake GP", "Atlantis")])
        mock_upsert.assert_not_called()
