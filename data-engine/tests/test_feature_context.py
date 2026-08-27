import pytest

from src.utils.driver_map import build_driver_code_map
from src.utils.feature_context import build_feature_context
from tests.support.fake_db import FakeConnection


def _race_row(**overrides):
    row = {
        "id": 1,
        "season_id": 2025,
        "weather": "dry",
        "sprint_weather": None,
        "circuit_id": 5,
        "event_format": "conventional",
        "overtake_rate": "0.850",
        "sc_probability": "0.300",
    }
    row.update(overrides)
    return row


class TestBuildFeatureContext:
    def test_assembles_context_from_race_grid_and_stats_rows(self):
        conn = FakeConnection([
            _race_row(),
            [
                {"driver_id": 10, "grid_position": 1},
                {"driver_id": 11, "grid_position": 3},
            ],
            [
                {"driver_id": 10, "team_id": 1, "races_entered": 5, "wins": 1},
                {"driver_id": 11, "team_id": 2, "races_entered": 5, "wins": 0},
            ],
            [
                {"team_id": 1, "car_performance_score": "0.80", "reliability_score": "0.90"},
                {"team_id": 2, "car_performance_score": None, "reliability_score": None},
            ],
        ])

        ctx = build_feature_context(
            conn, race_id=1, grid_table="qualifying_results", grid_not_found_message="no grid"
        )

        assert ctx.race_id == 1
        assert ctx.season_id == 2025
        assert ctx.circuit_id == 5
        assert ctx.overtake_rate == 0.850
        assert ctx.sc_probability == 0.300
        assert ctx.driver_ids == [10, 11]
        assert ctx.grid_map == {10: 1, 11: 3}
        assert ctx.start_pos_map[10] == pytest.approx(1.0)
        assert ctx.start_pos_map[11] == pytest.approx(0.9)
        assert ctx.team_perf == {1: 0.80, 2: 0.5}  # missing score defaults to neutral

    def test_race_not_found_raises(self):
        conn = FakeConnection([None])

        with pytest.raises(ValueError, match="Race 999 not found"):
            build_feature_context(conn, race_id=999, grid_table="qualifying_results", grid_not_found_message="no grid")

    def test_empty_grid_raises_with_the_given_message(self):
        conn = FakeConnection([_race_row(), []])

        with pytest.raises(ValueError, match="no sprint grid"):
            build_feature_context(
                conn, race_id=1, grid_table="sprint_results", grid_not_found_message="no sprint grid"
            )

    def test_validate_race_runs_before_the_grid_lookup(self):
        conn = FakeConnection([_race_row(event_format="conventional"), []])

        def reject_non_sprint(race):
            if race["event_format"] != "sprint_qualifying":
                raise ValueError("not a sprint weekend")

        with pytest.raises(ValueError, match="not a sprint weekend"):
            build_feature_context(
                conn,
                race_id=1,
                grid_table="sprint_results",
                grid_not_found_message="no sprint grid",
                validate_race=reject_non_sprint,
            )
        # validate_race raised before the grid query ran -> only one cursor was opened.
        assert len(conn.cursors) == 1


class TestBuildDriverCodeMap:
    def test_maps_driver_code_to_id(self):
        conn = FakeConnection([
            [{"code": "VER", "id": 10}, {"code": "LEC", "id": 11}],
        ])

        result = build_driver_code_map(conn, season_id=2025)

        assert result == {"VER": 10, "LEC": 11}
