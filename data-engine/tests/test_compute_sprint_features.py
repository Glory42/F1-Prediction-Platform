"""Covers compute_sprint_features._compute_short_run_pace: the SQ-time source, the
main-qualifying fallback when no SQ times exist, the neutral 0.5 when neither source
has data, per-driver fallback for drivers with no time, and the faster-is-higher
min-max inversion. FakeConnection scripts the one or two SELECTs it makes."""
from src.jobs.compute_sprint_features import _compute_short_run_pace
from tests.support.fake_db import FakeConnection


def _rows(*pairs):
    return [{"driver_id": d, "best_ms": ms} for d, ms in pairs]


def test_uses_sprint_qualifying_times_faster_driver_scores_higher():
    conn = FakeConnection([_rows((1, 90_000), (2, 91_000), (3, 92_000))])
    out = _compute_short_run_pace(conn, [1, 2, 3], race_id=7)
    assert out == {1: 1.0, 2: 0.5, 3: 0.0}
    # Only the sprint_results query ran.
    assert len(conn.cursors) == 1


def test_falls_back_to_main_qualifying_when_no_sq_times():
    conn = FakeConnection([
        _rows((1, None), (2, None)),          # sprint_results: present but empty
        _rows((1, 88_000), (2, 90_000)),      # qualifying_results fallback
    ])
    out = _compute_short_run_pace(conn, [1, 2], race_id=7)
    assert out == {1: 1.0, 2: 0.0}
    assert len(conn.cursors) == 2


def test_neutral_score_when_neither_source_has_data():
    conn = FakeConnection([[], []])
    out = _compute_short_run_pace(conn, [1, 2, 3], race_id=7)
    assert out == {1: 0.5, 2: 0.5, 3: 0.5}


def test_driver_without_a_time_gets_the_neutral_fallback():
    conn = FakeConnection([_rows((1, 90_000), (2, 92_000), (3, None))])
    out = _compute_short_run_pace(conn, [1, 2, 3], race_id=7)
    assert out == {1: 1.0, 2: 0.0, 3: 0.5}


def test_identical_times_collapse_to_neutral():
    conn = FakeConnection([_rows((1, 90_000), (2, 90_000))])
    out = _compute_short_run_pace(conn, [1, 2], race_id=7)
    assert out == {1: 0.5, 2: 0.5}


def test_driver_ids_absent_from_result_rows_default_to_neutral():
    conn = FakeConnection([_rows((1, 90_000), (2, 92_000))])
    out = _compute_short_run_pace(conn, [1, 2, 99], race_id=7)
    assert out[99] == 0.5
