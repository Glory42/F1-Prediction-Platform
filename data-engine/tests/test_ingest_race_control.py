from datetime import datetime, timedelta, timezone

import pytest

import src.jobs.ingest_race_control as ingest_race_control
from src.jobs.ingest_race_control import run
from tests.support.fake_db import FakeConnection

_LONG_AGO = datetime.now(timezone.utc) - timedelta(days=1)
_JUST_NOW = datetime.now(timezone.utc) - timedelta(minutes=10)

_MESSAGES = [
    {"date": "2024-11-03T15:31:01+00:00", "category": "Flag", "flag": "YELLOW",
     "lap_number": 12, "driver_number": None, "scope": "Sector", "sector": 5,
     "message": "YELLOW IN TRACK SECTOR 5"},
]


def _race_row(**overrides):
    row = {"id": 1, "race_date": "2024-11-03", "race_date_utc": _LONG_AGO, "status": "completed"}
    row.update(overrides)
    return row


def _patch_openf1(monkeypatch, messages=_MESSAGES, session_key=9636):
    monkeypatch.setattr(ingest_race_control, "get_session_key", lambda year, race_date: session_key)
    monkeypatch.setattr(ingest_race_control, "fetch_race_control", lambda key: messages)


class TestIngestRaceControl:
    def test_upserts_messages_and_commits_when_completed_and_past_live_window(self, monkeypatch):
        _patch_openf1(monkeypatch)
        upsert_calls = []
        monkeypatch.setattr(ingest_race_control, "upsert", lambda *a, **k: upsert_calls.append((a, k)))
        conn = FakeConnection([_race_row()])
        monkeypatch.setattr(ingest_race_control, "get_conn", lambda: conn)

        run(2024, 20)

        assert len(upsert_calls) == 1
        (conn_arg, table, rows, conflict_cols), _ = upsert_calls[0]
        assert table == "race_control_messages"
        assert conflict_cols == ["race_id", "date", "message"]
        assert rows[0]["race_id"] == 1
        assert rows[0]["message"] == "YELLOW IN TRACK SECTOR 5"
        assert conn.commits == 1
        assert conn.closed is True

    def test_skips_when_race_not_completed(self, monkeypatch):
        _patch_openf1(monkeypatch)
        upsert_calls = []
        monkeypatch.setattr(ingest_race_control, "upsert", lambda *a, **k: upsert_calls.append((a, k)))
        conn = FakeConnection([_race_row(status="qualifying_done")])
        monkeypatch.setattr(ingest_race_control, "get_conn", lambda: conn)

        run(2024, 20)

        assert upsert_calls == []
        assert conn.commits == 0

    def test_skips_when_still_inside_openf1_live_window(self, monkeypatch):
        _patch_openf1(monkeypatch)
        upsert_calls = []
        monkeypatch.setattr(ingest_race_control, "upsert", lambda *a, **k: upsert_calls.append((a, k)))
        conn = FakeConnection([_race_row(race_date_utc=_JUST_NOW)])
        monkeypatch.setattr(ingest_race_control, "get_conn", lambda: conn)

        run(2024, 20)

        assert upsert_calls == []
        assert conn.commits == 0

    def test_raises_when_race_not_found(self, monkeypatch):
        _patch_openf1(monkeypatch)
        conn = FakeConnection([None])
        monkeypatch.setattr(ingest_race_control, "get_conn", lambda: conn)

        with pytest.raises(ValueError, match="Race not found"):
            run(2024, 20)

    def test_no_messages_still_commits_without_upserting(self, monkeypatch):
        _patch_openf1(monkeypatch, messages=[])
        upsert_calls = []
        monkeypatch.setattr(ingest_race_control, "upsert", lambda *a, **k: upsert_calls.append((a, k)))
        conn = FakeConnection([_race_row()])
        monkeypatch.setattr(ingest_race_control, "get_conn", lambda: conn)

        run(2024, 20)

        assert upsert_calls == []
        assert conn.commits == 1
