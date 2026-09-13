from datetime import datetime, timedelta, timezone

import pytest

import src.jobs.ingest_team_radio as ingest_team_radio
from src.jobs.ingest_team_radio import run
from tests.support.fake_db import FakeConnection

_LONG_AGO = datetime.now(timezone.utc) - timedelta(days=1)
_JUST_NOW = datetime.now(timezone.utc) - timedelta(minutes=10)

_DRIVER_MAP = {4: 100}

_CLIPS = [
    {"date": "2024-11-03T14:45:52.496000+00:00", "driver_number": 4,
     "recording_url": "https://livetiming.formula1.com/static/clip.mp3"},
]


def _race_row(**overrides):
    row = {"id": 1, "season_id": 10, "race_date": "2024-11-03", "race_date_utc": _LONG_AGO, "status": "completed"}
    row.update(overrides)
    return row


def _patch_openf1(monkeypatch, clips=_CLIPS, session_key=9636, driver_map=None):
    monkeypatch.setattr(ingest_team_radio, "get_session_key", lambda year, race_date: session_key)
    monkeypatch.setattr(ingest_team_radio, "fetch_team_radio", lambda key: clips)
    monkeypatch.setattr(
        ingest_team_radio, "build_driver_number_map",
        lambda conn, season_id: dict(driver_map if driver_map is not None else _DRIVER_MAP)
    )


class TestIngestTeamRadio:
    def test_upserts_clips_and_commits_when_completed_and_past_live_window(self, monkeypatch):
        _patch_openf1(monkeypatch)
        upsert_calls = []
        monkeypatch.setattr(ingest_team_radio, "upsert", lambda *a, **k: upsert_calls.append((a, k)))
        conn = FakeConnection([_race_row()])
        monkeypatch.setattr(ingest_team_radio, "get_conn", lambda: conn)

        run(2024, 20)

        assert len(upsert_calls) == 1
        (conn_arg, table, rows, conflict_cols), _ = upsert_calls[0]
        assert table == "team_radio_clips"
        assert conflict_cols == ["race_id", "driver_id", "date"]
        assert rows[0]["race_id"] == 1
        assert rows[0]["driver_id"] == 100
        assert rows[0]["recording_url"] == "https://livetiming.formula1.com/static/clip.mp3"
        assert conn.commits == 1
        assert conn.closed is True

    def test_skips_clips_with_unknown_driver_number(self, monkeypatch):
        _patch_openf1(monkeypatch, driver_map={})
        upsert_calls = []
        monkeypatch.setattr(ingest_team_radio, "upsert", lambda *a, **k: upsert_calls.append((a, k)))
        conn = FakeConnection([_race_row()])
        monkeypatch.setattr(ingest_team_radio, "get_conn", lambda: conn)

        run(2024, 20)

        assert upsert_calls == []
        assert conn.commits == 1

    def test_no_clips_still_commits_without_upserting(self, monkeypatch):
        _patch_openf1(monkeypatch, clips=[])
        upsert_calls = []
        monkeypatch.setattr(ingest_team_radio, "upsert", lambda *a, **k: upsert_calls.append((a, k)))
        conn = FakeConnection([_race_row()])
        monkeypatch.setattr(ingest_team_radio, "get_conn", lambda: conn)

        run(2024, 20)

        assert upsert_calls == []
        assert conn.commits == 1

    def test_skips_when_race_not_completed(self, monkeypatch):
        _patch_openf1(monkeypatch)
        upsert_calls = []
        monkeypatch.setattr(ingest_team_radio, "upsert", lambda *a, **k: upsert_calls.append((a, k)))
        conn = FakeConnection([_race_row(status="qualifying_done")])
        monkeypatch.setattr(ingest_team_radio, "get_conn", lambda: conn)

        run(2024, 20)

        assert upsert_calls == []
        assert conn.commits == 0

    def test_skips_when_still_inside_openf1_live_window(self, monkeypatch):
        _patch_openf1(monkeypatch)
        upsert_calls = []
        monkeypatch.setattr(ingest_team_radio, "upsert", lambda *a, **k: upsert_calls.append((a, k)))
        conn = FakeConnection([_race_row(race_date_utc=_JUST_NOW)])
        monkeypatch.setattr(ingest_team_radio, "get_conn", lambda: conn)

        run(2024, 20)

        assert upsert_calls == []
        assert conn.commits == 0

    def test_raises_when_race_not_found(self, monkeypatch):
        _patch_openf1(monkeypatch)
        conn = FakeConnection([None])
        monkeypatch.setattr(ingest_team_radio, "get_conn", lambda: conn)

        with pytest.raises(ValueError, match="Race not found"):
            run(2024, 20)
