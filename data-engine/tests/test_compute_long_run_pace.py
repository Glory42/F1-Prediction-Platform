from src.jobs.compute_features import _compute_long_run_pace
from tests.support.fake_db import FakeConnection


class TestComputeLongRunPace:
    def test_uses_practice_data_when_most_drivers_have_rows(self):
        """Sprint-weekend FP1 fallback data lands in fp2_long_run_times; when >=70%
        of drivers have practice medians, the feature comes from practice (used_fp
        True) rather than the historical fallback."""
        conn = FakeConnection([
            # first query: fp2_long_run_times medians per driver (FP1 fallback data)
            [
                {"driver_id": 1, "best_median_ms": 80000},
                {"driver_id": 2, "best_median_ms": 81000},
                {"driver_id": 3, "best_median_ms": 82000},
            ],
        ])

        pace_map, used_fp = _compute_long_run_pace(conn, [1, 2, 3], 5, 420)

        assert used_fp is True
        # lower median = faster = higher score
        assert pace_map[1] > pace_map[2] > pace_map[3]

    def test_falls_back_to_historical_circuit_pace_when_practice_coverage_is_low(self):
        """When fewer than 70% of drivers have practice medians, the feature falls
        back to historical circuit lap_times (used_fp False)."""
        conn = FakeConnection([
            # first query: only 1 of 3 drivers has practice data -> below 70%
            [
                {"driver_id": 1, "best_median_ms": 80000},
            ],
            # second query: last 6 completed races at this circuit
            [{"id": 100}, {"id": 99}, {"id": 98}],
            # third query: historical medians for the past races
            [
                {"driver_id": 1, "median_ms": 79000},
                {"driver_id": 2, "median_ms": 83000},
                {"driver_id": 3, "median_ms": 86000},
            ],
        ])

        pace_map, used_fp = _compute_long_run_pace(conn, [1, 2, 3], 5, 420)

        assert used_fp is False
        # historical medians used: driver 1 fastest, driver 3 slowest
        assert pace_map[1] > pace_map[2] > pace_map[3]

    def test_neutral_when_no_practice_and_no_history(self):
        """No practice data and no past races at this circuit -> all-neutral 0.5."""
        conn = FakeConnection([
            [],  # fp2_long_run_times empty
            [],  # no past completed races at circuit
        ])

        pace_map, used_fp = _compute_long_run_pace(conn, [1, 2, 3], 5, 420)

        assert used_fp is False
        assert pace_map == {1: 0.5, 2: 0.5, 3: 0.5}