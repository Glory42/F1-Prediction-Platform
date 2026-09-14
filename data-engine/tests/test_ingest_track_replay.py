from datetime import datetime, timedelta, timezone

import pytest

import src.jobs.ingest_track_replay as ingest_track_replay
from src.jobs.ingest_track_replay import _downsample, run
from tests.support.fake_db import FakeConnection

_LONG_AGO = datetime.now(timezone.utc) - timedelta(days=1)
_JUST_NOW = datetime.now(timezone.utc) - timedelta(minutes=10)

_DRIVER_MAP = {1: 100, 44: 101}

_POINTS = [
    {"date": "2024-11-03T14:38:00.000000+00:00", "x": 100, "y": 200},
    {"date": "2024-11-03T14:38:03.000000+00:00", "x": 110, "y": 210},
]


def _race_row(**overrides):
    row = {"id": 1, "season_id": 10, "race_date": "2024-11-03", "race_date_utc": _LONG_AGO, "status": "completed"}
    row.update(overrides)
    return row


def _patch_openf1(monkeypatch, points=_POINTS, session_key=9636, driver_map=None):
    monkeypatch.setattr(ingest_track_replay, "get_session_key", lambda year, race_date: session_key)
    monkeypatch.setattr(ingest_track_replay, "fetch_location", lambda key, driver_number: points)
    monkeypatch.setattr(
        ingest_track_replay, "build_driver_number_map",
        lambda conn, season_id: dict(driver_map if driver_map is not None else _DRIVER_MAP)
    )
    # Real per-driver pacing would make the test suite slow for no reason.
    monkeypatch.setattr(ingest_track_replay.time, "sleep", lambda *_: None)


class TestDownsample:
    def test_empty_returns_empty(self):
        assert _downsample([]) == []

    def test_always_keeps_the_first_point(self):
        points = [{"date": "2024-11-03T14:38:00.000000+00:00", "x": 1, "y": 1}]
        assert _downsample(points) == points

    def test_drops_points_closer_than_the_interval(self):
        points = [
            {"date": "2024-11-03T14:38:00.000000+00:00", "x": 1, "y": 1},
            {"date": "2024-11-03T14:38:00.500000+00:00", "x": 2, "y": 2},
        ]
        assert _downsample(points, interval_s=2.0) == [points[0]]

    def test_keeps_points_at_or_beyond_the_interval(self):
        points = [
            {"date": "2024-11-03T14:38:00.000000+00:00", "x": 1, "y": 1},
            {"date": "2024-11-03T14:38:02.000000+00:00", "x": 2, "y": 2},
        ]
        assert _downsample(points, interval_s=2.0) == points

    def test_measures_each_kept_gap_from_the_last_kept_point_not_the_previous_raw_point(self):
        # Three points 1s apart: the 2nd is dropped (only 1s since the 1st), but the 3rd is
        # kept because it's 2s since the 1st *kept* point, not 1s since the dropped 2nd.
        points = [
            {"date": "2024-11-03T14:38:00.000000+00:00", "x": 1, "y": 1},
            {"date": "2024-11-03T14:38:01.000000+00:00", "x": 2, "y": 2},
            {"date": "2024-11-03T14:38:02.000000+00:00", "x": 3, "y": 3},
        ]
        assert _downsample(points, interval_s=2.0) == [points[0], points[2]]


class TestIngestTrackReplay:
    def test_upserts_downsampled_points_across_all_drivers(self, monkeypatch):
        _patch_openf1(monkeypatch)
        upsert_calls = []
        monkeypatch.setattr(ingest_track_replay, "upsert", lambda *a, **k: upsert_calls.append((a, k)))
        conn = FakeConnection([_race_row()])
        monkeypatch.setattr(ingest_track_replay, "get_conn", lambda: conn)

        run(2024, 20)

        assert len(upsert_calls) == 1
        (conn_arg, table, rows, conflict_cols), _ = upsert_calls[0]
        assert table == "track_locations"
        assert conflict_cols == ["race_id", "driver_id", "date"]
        assert len(rows) == 4  # 2 points x 2 drivers, both kept (3s apart > 2s interval)
        assert {r["driver_id"] for r in rows} == {100, 101}
        assert rows[0]["race_id"] == 1
        assert rows[0]["x"] == 100
        assert rows[0]["y"] == 200
        assert conn.commits == 1
        assert conn.closed is True

    def test_skips_a_driver_that_keeps_failing_but_still_upserts_the_rest(self, monkeypatch):
        _patch_openf1(monkeypatch)
        monkeypatch.setattr(ingest_track_replay, "_MAX_RETRIES", 1)

        def flaky_fetch(key, driver_number):
            if driver_number == 1:
                raise RuntimeError("422 from OpenF1")
            return _POINTS

        monkeypatch.setattr(ingest_track_replay, "fetch_location", flaky_fetch)
        upsert_calls = []
        monkeypatch.setattr(ingest_track_replay, "upsert", lambda *a, **k: upsert_calls.append((a, k)))
        conn = FakeConnection([_race_row()])
        monkeypatch.setattr(ingest_track_replay, "get_conn", lambda: conn)

        run(2024, 20)

        assert len(upsert_calls) == 1
        (conn_arg, table, rows, conflict_cols), _ = upsert_calls[0]
        assert {r["driver_id"] for r in rows} == {101}  # only driver 44 -> driver_id 101 survived
        assert conn.commits == 1

    def test_no_points_still_commits_without_upserting(self, monkeypatch):
        _patch_openf1(monkeypatch, points=[])
        upsert_calls = []
        monkeypatch.setattr(ingest_track_replay, "upsert", lambda *a, **k: upsert_calls.append((a, k)))
        conn = FakeConnection([_race_row()])
        monkeypatch.setattr(ingest_track_replay, "get_conn", lambda: conn)

        run(2024, 20)

        assert upsert_calls == []
        assert conn.commits == 1

    def test_skips_when_race_not_completed(self, monkeypatch):
        _patch_openf1(monkeypatch)
        upsert_calls = []
        monkeypatch.setattr(ingest_track_replay, "upsert", lambda *a, **k: upsert_calls.append((a, k)))
        conn = FakeConnection([_race_row(status="qualifying_done")])
        monkeypatch.setattr(ingest_track_replay, "get_conn", lambda: conn)

        run(2024, 20)

        assert upsert_calls == []
        assert conn.commits == 0

    def test_skips_when_still_inside_openf1_live_window(self, monkeypatch):
        _patch_openf1(monkeypatch)
        upsert_calls = []
        monkeypatch.setattr(ingest_track_replay, "upsert", lambda *a, **k: upsert_calls.append((a, k)))
        conn = FakeConnection([_race_row(race_date_utc=_JUST_NOW)])
        monkeypatch.setattr(ingest_track_replay, "get_conn", lambda: conn)

        run(2024, 20)

        assert upsert_calls == []
        assert conn.commits == 0

    def test_raises_when_race_not_found(self, monkeypatch):
        _patch_openf1(monkeypatch)
        conn = FakeConnection([None])
        monkeypatch.setattr(ingest_track_replay, "get_conn", lambda: conn)

        with pytest.raises(ValueError, match="Race not found"):
            run(2024, 20)
