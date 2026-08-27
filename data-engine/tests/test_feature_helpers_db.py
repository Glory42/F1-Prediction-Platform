from src.utils.feature_helpers import compute_luck_score, compute_weather_score
from tests.support.fake_db import FakeConnection


class TestComputeWeatherScore:
    def test_dry_weather_is_neutral_and_skips_the_query(self):
        conn = FakeConnection([])

        result = compute_weather_score(conn, [1, 2], "dry")

        assert result == {1: 0.5, 2: 0.5}
        assert conn.cursors == []

    def test_wet_weather_ranks_better_historical_finishers_higher(self):
        conn = FakeConnection([
            [
                {"driver_id": 1, "wet_avg": 3.0, "wet_races": 2},
                {"driver_id": 2, "wet_avg": 15.0, "wet_races": 3},
            ],
        ])

        result = compute_weather_score(conn, [1, 2, 3], "wet")

        assert result[1] == 1.0
        assert result[2] == 0.0
        assert result[3] == 0.5  # no history -> filled with the field average


class TestComputeLuckScore:
    def test_race_not_found_returns_neutral_for_all_drivers(self):
        conn = FakeConnection([None])

        result = compute_luck_score(conn, [1, 2], race_id=999, team_perf={}, stats_rows={})

        assert result == {1: 0.5, 2: 0.5}

    def test_driver_with_no_recent_races_gets_zero_delta_and_loses_normalization(self):
        conn = FakeConnection([
            {"race_date": "2025-01-01"},
            [
                {"driver_id": 1, "grid_position": 2, "finish_position": 1},
                {"driver_id": 1, "grid_position": 3, "finish_position": 2},
            ],
        ])

        result = compute_luck_score(
            conn,
            [1, 2],
            race_id=1,
            team_perf={10: 0.8, 20: 0.3},
            stats_rows={1: {"team_id": 10}, 2: {"team_id": 20}},
        )

        # Driver 1 outperformed expectations (positive delta), driver 2 has no
        # recent results (delta 0.0) -> normalized to the extremes.
        assert result[1] == 1.0
        assert result[2] == 0.0
