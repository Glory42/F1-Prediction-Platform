from datetime import date, timedelta

import pytest

import src.utils.ingest_runner as ingest_runner
from src.utils.ingest_runner import (
    IngestJobConfig,
    QualifyingContext,
    QualifyingJobConfig,
    RaceContext,
    run_ingest_job,
    run_qualifying_ingest_job,
)
from tests.support.fake_db import FakeConnection

_RESULT_ROWS = [
    {
        "driver_code": "VER",
        "finish_position": 1,
        "grid_position": 1,
        "points": 25.0,
        "status": "Finished",
        "total_race_time_ms": 5400000,
        "fastest_lap": True,
        "headshot_url": None,
    },
    {
        "driver_code": "HAM",
        "finish_position": 2,
        "grid_position": 2,
        "points": 18.0,
        "status": "Finished",
        "total_race_time_ms": 5405000,
        "fastest_lap": False,
        "headshot_url": None,
    },
]

_LAP_ROWS = [
    {
        "driver_code": "VER",
        "lap_number": 1,
        "lap_time_ms": 90000,
        "sector1_ms": 30000,
        "sector2_ms": 30000,
        "sector3_ms": 30000,
        "speed_st": 300.0,
        "compound": "SOFT",
        "tyre_life": 1,
        "fresh_tyre": True,
        "is_pit_lap": False,
        "stint_number": 1,
    },
]

_DRIVER_MAP = {"VER": 1, "HAM": 2}


def _patch_race_session_helpers(monkeypatch, **overrides):
    defaults = {
        "get_session": lambda year, round_num, session_type: object(),
        "validate_session_data": lambda session, session_type: True,
        "get_weather": lambda session: "Dry",
        "get_weather_details": lambda session: {
            "air_temp_avg": 25.0,
            "track_temp_avg": 35.0,
            "humidity_avg": 50.0,
        },
        "get_sc_vsc_laps": lambda session: {"safety_car_laps": 0, "vsc_laps": 0},
        "session_to_race_results": lambda session: _RESULT_ROWS,
        "session_to_lap_times": lambda session: _LAP_ROWS,
        "build_driver_code_map": lambda conn, season_id: dict(_DRIVER_MAP),
    }
    defaults.update(overrides)
    for name, fn in defaults.items():
        monkeypatch.setattr(ingest_runner, name, fn)


def _spy(calls):
    def fn(*args, **kwargs):
        calls.append((args, kwargs))

    return fn


class TestRunIngestJob:
    def _config(self, **overrides):
        defaults = dict(
            job_name="test_ingest_job",
            session_type="R",
            session_label="Race",
            results_table="race_results",
            lap_times_table="lap_times",
            time_field="total_sprint_time_ms",  # deliberately distinct from the source dict's
            # own "total_race_time_ms" key, to prove the row-building loop maps through
            # config.time_field rather than hardcoding a column name
            results_row_label="race result",
            laps_row_label="lap time",
            no_results_error="No results for race {race_id}",
            resolve_race=lambda conn, year, round_num: RaceContext(race_id=1, season_id=10),
            mark_status=lambda conn, ctx, weather, weather_details, sc_vsc: None,
        )
        defaults.update(overrides)
        return IngestJobConfig(**defaults)

    def test_happy_path_upserts_results_and_laps_and_commits(self, monkeypatch):
        _patch_race_session_helpers(monkeypatch)
        upsert_calls = []
        monkeypatch.setattr(ingest_runner, "upsert", lambda *a, **k: upsert_calls.append((a, k)))
        mark_status_calls = []
        config = self._config(
            mark_status=lambda conn, ctx, weather, weather_details, sc_vsc: mark_status_calls.append(
                (ctx, weather, weather_details, sc_vsc)
            )
        )
        conn = FakeConnection([])
        monkeypatch.setattr(ingest_runner, "get_conn", lambda: conn)

        run_ingest_job(2026, 5, config)

        assert len(upsert_calls) == 2
        (conn0, table0, rows0, conflict0), _ = upsert_calls[0]
        assert table0 == "race_results"
        assert conflict0 == ["race_id", "driver_id"]
        assert rows0[0]["total_sprint_time_ms"] == 5400000
        assert "total_race_time_ms" not in rows0[0]

        (conn1, table1, rows1, conflict1), _ = upsert_calls[1]
        assert table1 == "lap_times"
        assert conflict1 == ["race_id", "driver_id", "lap_number"]
        assert rows1[0]["lap_time_ms"] == 90000

        assert len(mark_status_calls) == 1
        assert mark_status_calls[0][1] == "Dry"
        assert conn.commits == 1
        assert conn.closed is True

    def test_cross_table_hook_runs_after_mark_status_when_configured(self, monkeypatch):
        _patch_race_session_helpers(monkeypatch)
        monkeypatch.setattr(ingest_runner, "upsert", lambda *a, **k: None)
        conn = FakeConnection([])
        monkeypatch.setattr(ingest_runner, "get_conn", lambda: conn)

        call_order = []
        config = self._config(
            mark_status=lambda *a: call_order.append("mark_status"),
            cross_table_hook=lambda conn, ctx: call_order.append("cross_table_hook"),
        )

        run_ingest_job(2026, 5, config)

        assert call_order == ["mark_status", "cross_table_hook"]

    def test_cross_table_hook_not_called_when_not_configured(self, monkeypatch):
        _patch_race_session_helpers(monkeypatch)
        monkeypatch.setattr(ingest_runner, "upsert", lambda *a, **k: None)
        conn = FakeConnection([])
        monkeypatch.setattr(ingest_runner, "get_conn", lambda: conn)

        config = self._config(cross_table_hook=None)

        run_ingest_job(2026, 5, config)

        assert conn.commits == 1

    def test_raises_when_session_data_invalid(self, monkeypatch):
        _patch_race_session_helpers(monkeypatch, validate_session_data=lambda session, session_type: False)
        upsert_calls = []
        monkeypatch.setattr(ingest_runner, "upsert", lambda *a, **k: upsert_calls.append((a, k)))
        conn = FakeConnection([])
        monkeypatch.setattr(ingest_runner, "get_conn", lambda: conn)

        with pytest.raises(RuntimeError, match="not fully available"):
            run_ingest_job(2026, 5, self._config())

        assert upsert_calls == []
        assert conn.commits == 0
        assert conn.closed is True

    def test_raises_when_no_results_rows_survive_driver_map_lookup(self, monkeypatch):
        _patch_race_session_helpers(monkeypatch, build_driver_code_map=lambda conn, season_id: {})
        upsert_calls = []
        monkeypatch.setattr(ingest_runner, "upsert", lambda *a, **k: upsert_calls.append((a, k)))
        conn = FakeConnection([])
        monkeypatch.setattr(ingest_runner, "get_conn", lambda: conn)

        with pytest.raises(RuntimeError, match="No results for race 1"):
            run_ingest_job(2026, 5, self._config())

        assert upsert_calls == []

    def test_headshot_backfill_only_for_rows_with_headshot_url_and_known_driver(self, monkeypatch):
        result_rows = [
            {**_RESULT_ROWS[0], "headshot_url": "https://example.com/ver.jpg"},
            {**_RESULT_ROWS[1], "headshot_url": None},
            {
                "driver_code": "XXX",
                "finish_position": 3,
                "grid_position": 3,
                "points": 0.0,
                "status": "Finished",
                "total_race_time_ms": 5410000,
                "fastest_lap": False,
                "headshot_url": "https://example.com/xxx.jpg",
            },
        ]
        _patch_race_session_helpers(monkeypatch, session_to_race_results=lambda session: result_rows)
        monkeypatch.setattr(ingest_runner, "upsert", lambda *a, **k: None)
        batch_calls = []
        monkeypatch.setattr(
            ingest_runner, "execute_batch", lambda cur, query, params, page_size=200: batch_calls.append(params)
        )
        conn = FakeConnection([])
        monkeypatch.setattr(ingest_runner, "get_conn", lambda: conn)

        run_ingest_job(2026, 5, self._config())

        assert len(batch_calls) == 1
        assert batch_calls[0] == [("https://example.com/ver.jpg", 1)]

    def test_laps_upsert_skipped_when_no_lap_rows(self, monkeypatch):
        _patch_race_session_helpers(monkeypatch, session_to_lap_times=lambda session: [])
        upsert_calls = []
        monkeypatch.setattr(ingest_runner, "upsert", lambda *a, **k: upsert_calls.append((a, k)))
        conn = FakeConnection([])
        monkeypatch.setattr(ingest_runner, "get_conn", lambda: conn)

        run_ingest_job(2026, 5, self._config())

        assert len(upsert_calls) == 1

    def test_conn_closed_even_when_resolve_race_raises(self, monkeypatch):
        get_session_calls = []
        _patch_race_session_helpers(
            monkeypatch, get_session=lambda year, round_num, session_type: get_session_calls.append(1)
        )
        conn = FakeConnection([])
        monkeypatch.setattr(ingest_runner, "get_conn", lambda: conn)

        def _raise(conn, year, round_num):
            raise ValueError("boom")

        with pytest.raises(ValueError, match="boom"):
            run_ingest_job(2026, 5, self._config(resolve_race=_raise))

        assert conn.closed is True
        assert get_session_calls == []


_QUALI_ROWS = [
    {
        "driver_code": "VER",
        "grid_position": 1,
        "q1_time_ms": 80000,
        "q2_time_ms": 79000,
        "q3_time_ms": 78000,
        "sector1_ms": 26000,
        "sector2_ms": 26000,
        "sector3_ms": 26000,
        "speed_st": 310.0,
    },
]


def _patch_quali_session_helpers(monkeypatch, **overrides):
    defaults = {
        "get_session": lambda year, round_num, session_type, messages=False: object(),
        "session_to_quali_results": lambda session: _QUALI_ROWS,
        "build_driver_code_map": lambda conn, season_id: dict(_DRIVER_MAP),
    }
    defaults.update(overrides)
    for name, fn in defaults.items():
        monkeypatch.setattr(ingest_runner, name, fn)


class TestRunQualifyingIngestJob:
    def _config(self, **overrides):
        defaults = dict(
            job_name="test_qual_job",
            results_table="qualifying_results",
            results_row_label="qualifying",
            allowed_event_formats=frozenset({"conventional"}),
            format_error="bad format '{event_format}' round {round_num}",
            date_guard_error="too early: {year} R{round_num} on {day}",
            no_results_error="no rows for {year} R{round_num} (race {race_id})",
            session_type_for=lambda event_format: "Q",
            resolve_race=lambda conn, year, round_num: QualifyingContext(
                race_id=1, season_id=10, event_format="conventional", quali_day=None
            ),
            rows_from_quali=lambda quali_rows, driver_map, race_id: [
                {"race_id": race_id, "driver_id": 1, "grid_position": 1}
            ],
            new_status="qualifying_done",
            status_guard=("scheduled",),
        )
        defaults.update(overrides)
        return QualifyingJobConfig(**defaults)

    def test_happy_path_upserts_rows_and_bumps_status(self, monkeypatch):
        _patch_quali_session_helpers(monkeypatch)
        upsert_calls = []
        monkeypatch.setattr(ingest_runner, "upsert", lambda *a, **k: upsert_calls.append((a, k)))
        rows_from_quali_calls = []

        def _rows_from_quali(quali_rows, driver_map, race_id):
            rows_from_quali_calls.append((quali_rows, driver_map, race_id))
            return [{"race_id": race_id, "driver_id": 1, "grid_position": 1}]

        conn = FakeConnection([])
        monkeypatch.setattr(ingest_runner, "get_conn", lambda: conn)

        run_qualifying_ingest_job(2026, 5, self._config(rows_from_quali=_rows_from_quali))

        assert rows_from_quali_calls == [(_QUALI_ROWS, _DRIVER_MAP, 1)]

        (conn_arg, table, rows, conflict), kwargs = upsert_calls[0]
        assert table == "qualifying_results"
        assert conflict == ["race_id", "driver_id"]
        assert kwargs["exclude_update"] is None

        query, params = conn.cursors[-1].executed[-1]
        assert params == ("qualifying_done", 1, ("scheduled",))
        assert conn.commits == 1
        assert conn.closed is True

    def test_date_guard_raises_when_quali_day_in_future(self, monkeypatch):
        get_session_calls = []
        _patch_quali_session_helpers(
            monkeypatch, get_session=lambda *a, **k: get_session_calls.append(1)
        )
        conn = FakeConnection([])
        monkeypatch.setattr(ingest_runner, "get_conn", lambda: conn)
        future_day = date.today() + timedelta(days=3)

        config = self._config(
            resolve_race=lambda conn, year, round_num: QualifyingContext(
                race_id=1, season_id=10, event_format="conventional", quali_day=future_day
            )
        )

        with pytest.raises(RuntimeError, match="too early"):
            run_qualifying_ingest_job(2026, 5, config)

        assert get_session_calls == []

    def test_date_guard_skipped_when_quali_day_is_none(self, monkeypatch):
        _patch_quali_session_helpers(monkeypatch)
        monkeypatch.setattr(ingest_runner, "upsert", lambda *a, **k: None)
        conn = FakeConnection([])
        monkeypatch.setattr(ingest_runner, "get_conn", lambda: conn)

        run_qualifying_ingest_job(2026, 5, self._config())  # default quali_day=None

        assert conn.commits == 1

    def test_format_guard_raises_for_unsupported_event_format(self, monkeypatch):
        _patch_quali_session_helpers(monkeypatch)
        conn = FakeConnection([])
        monkeypatch.setattr(ingest_runner, "get_conn", lambda: conn)

        config = self._config(
            resolve_race=lambda conn, year, round_num: QualifyingContext(
                race_id=1, season_id=10, event_format="unknown", quali_day=None
            )
        )

        with pytest.raises(ValueError, match="bad format"):
            run_qualifying_ingest_job(2026, 5, config)

    def test_raises_when_no_rows_survive_driver_map_lookup(self, monkeypatch):
        _patch_quali_session_helpers(monkeypatch)
        upsert_calls = []
        monkeypatch.setattr(ingest_runner, "upsert", lambda *a, **k: upsert_calls.append((a, k)))
        conn = FakeConnection([])
        monkeypatch.setattr(ingest_runner, "get_conn", lambda: conn)

        config = self._config(rows_from_quali=lambda quali_rows, driver_map, race_id: [])

        with pytest.raises(RuntimeError, match="no rows for 2026 R5"):
            run_qualifying_ingest_job(2026, 5, config)

        assert upsert_calls == []

    def test_status_update_uses_in_clause_with_status_guard_tuple(self, monkeypatch):
        _patch_quali_session_helpers(monkeypatch)
        monkeypatch.setattr(ingest_runner, "upsert", lambda *a, **k: None)
        conn = FakeConnection([])
        monkeypatch.setattr(ingest_runner, "get_conn", lambda: conn)

        config = self._config(status_guard=("scheduled", "sprint_done"))

        run_qualifying_ingest_job(2026, 5, config)

        query, params = conn.cursors[-1].executed[-1]
        assert "IN %s" in query
        assert params == ("qualifying_done", 1, ("scheduled", "sprint_done"))

    def test_session_type_for_drives_get_session_call(self, monkeypatch):
        session_type_calls = []
        _patch_quali_session_helpers(
            monkeypatch,
            get_session=lambda year, round_num, session_type, messages=False: session_type_calls.append(
                session_type
            ),
        )
        monkeypatch.setattr(ingest_runner, "upsert", lambda *a, **k: None)
        conn = FakeConnection([])
        monkeypatch.setattr(ingest_runner, "get_conn", lambda: conn)

        config = self._config(session_type_for=lambda event_format: "SS")

        run_qualifying_ingest_job(2026, 5, config)

        assert session_type_calls == ["SS"]

    def test_exclude_update_forwarded_to_upsert_when_configured(self, monkeypatch):
        _patch_quali_session_helpers(monkeypatch)
        upsert_calls = []
        monkeypatch.setattr(ingest_runner, "upsert", lambda *a, **k: upsert_calls.append((a, k)))
        conn = FakeConnection([])
        monkeypatch.setattr(ingest_runner, "get_conn", lambda: conn)

        config = self._config(exclude_update=["finish_position", "points"])

        run_qualifying_ingest_job(2026, 5, config)

        _, kwargs = upsert_calls[0]
        assert kwargs["exclude_update"] == ["finish_position", "points"]
