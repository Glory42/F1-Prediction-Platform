import pytest

from src.jobs.compute_features import blend_compound_slopes, _field_median


class TestBlendCompoundSlopes:
    """Tests for the compound-stratified tyre degradation blending logic."""

    # ── Primary path: compounds meet per-compound floor ──────────────────

    def test_single_compound_above_threshold(self):
        # Only Hard has enough laps (20 >= 8)
        result = blend_compound_slopes([
            (None, 0),       # Soft: no data
            (None, 0),       # Medium: no data
            (-50.0, 20),     # Hard: qualifies
        ])
        assert result == pytest.approx(-50.0)

    def test_two_compounds_weighted_blend(self):
        # Medium (20 laps, slope -100) + Hard (30 laps, slope -40)
        result = blend_compound_slopes([
            (None, 0),       # Soft: no data
            (-100.0, 20),    # Medium: qualifies
            (-40.0, 30),     # Hard: qualifies
        ])
        expected = (-100.0 * 20 + -40.0 * 30) / (20 + 30)
        assert result == pytest.approx(expected)

    def test_all_three_compounds_weighted_blend(self):
        result = blend_compound_slopes([
            (-200.0, 10),    # Soft: qualifies
            (-100.0, 25),    # Medium: qualifies
            (-30.0, 40),     # Hard: qualifies
        ])
        expected = (-200.0 * 10 + -100.0 * 25 + -30.0 * 40) / (10 + 25 + 40)
        assert result == pytest.approx(expected)

    def test_compound_below_threshold_excluded_from_primary(self):
        # Soft has only 5 laps (< 8), should not contribute to primary blend
        result = blend_compound_slopes([
            (-200.0, 5),     # Soft: below threshold
            (-100.0, 20),    # Medium: qualifies
            (-30.0, 30),     # Hard: qualifies
        ])
        expected = (-100.0 * 20 + -30.0 * 30) / (20 + 30)
        assert result == pytest.approx(expected)

    # ── Fallback path: no compound meets floor, total laps >= 10 ─────────

    def test_even_split_below_per_compound_floor_uses_fallback(self):
        # The reviewer's scenario: 5+5+5 = 15 total, no compound >= 8
        # Fallback kicks in because 15 >= 10
        result = blend_compound_slopes([
            (-150.0, 5),     # Soft: below floor
            (-80.0, 5),      # Medium: below floor
            (-30.0, 5),      # Hard: below floor
        ])
        assert result is not None
        expected = (-150.0 * 5 + -80.0 * 5 + -30.0 * 5) / 15
        assert result == pytest.approx(expected)

    def test_fallback_with_partial_slopes(self):
        # 4+4+4 = 12 total >= 10, but one compound has no slope
        result = blend_compound_slopes([
            (None, 4),       # Soft: slope is None (too few for regression)
            (-80.0, 4),      # Medium: valid slope
            (-30.0, 4),      # Hard: valid slope
        ])
        assert result is not None
        expected = (-80.0 * 4 + -30.0 * 4) / 8
        assert result == pytest.approx(expected)

    # ── No data / insufficient data ──────────────────────────────────────

    def test_no_data_returns_none(self):
        result = blend_compound_slopes([
            (None, 0),
            (None, 0),
            (None, 0),
        ])
        assert result is None

    def test_total_laps_below_fallback_threshold_returns_none(self):
        # 3+3+3 = 9 total < 10, and no compound >= 8
        result = blend_compound_slopes([
            (-150.0, 3),
            (-80.0, 3),
            (-30.0, 3),
        ])
        assert result is None

    def test_slopes_all_none_with_enough_laps_returns_none(self):
        # Enough laps total but regressions all failed (e.g. constant values)
        result = blend_compound_slopes([
            (None, 10),
            (None, 10),
            (None, 10),
        ])
        assert result is None

    # ── Custom thresholds ────────────────────────────────────────────────

    def test_custom_min_laps_per_compound(self):
        # With min_laps_per_compound=20, only Hard qualifies
        result = blend_compound_slopes(
            [(-200.0, 15), (-100.0, 15), (-30.0, 25)],
            min_laps_per_compound=20,
        )
        assert result == pytest.approx(-30.0)

    def test_custom_min_total_laps(self):
        # 3+3+3 = 9 laps; default min_total=10 → None, but with min_total=8 → fallback
        result = blend_compound_slopes(
            [(-150.0, 3), (-80.0, 3), (-30.0, 3)],
            min_total_laps=8,
        )
        assert result is not None

    # ── Edge cases ───────────────────────────────────────────────────────

    def test_empty_compounds_list(self):
        result = blend_compound_slopes([])
        assert result is None

    def test_primary_takes_precedence_over_fallback(self):
        # One compound qualifies for primary → fallback is never reached
        result = blend_compound_slopes([
            (-200.0, 5),     # below floor
            (-100.0, 10),    # qualifies (>= 8)
            (-30.0, 3),      # below floor
        ])
        # Only Medium contributes via primary path
        assert result == pytest.approx(-100.0)


class TestFieldMedian:
    """Tests for the corrected median calculation."""

    def test_odd_length(self):
        assert _field_median([10.0, 20.0, 30.0]) == pytest.approx(20.0)

    def test_even_length_averages_middle_two(self):
        assert _field_median([10.0, 20.0, 30.0, 40.0]) == pytest.approx(25.0)

    def test_single_value(self):
        assert _field_median([42.0]) == pytest.approx(42.0)

    def test_two_values(self):
        assert _field_median([10.0, 30.0]) == pytest.approx(20.0)

    def test_unsorted_input(self):
        assert _field_median([30.0, 10.0, 20.0]) == pytest.approx(20.0)

    def test_negative_values(self):
        assert _field_median([-100.0, -50.0, -20.0, -10.0]) == pytest.approx(-35.0)
