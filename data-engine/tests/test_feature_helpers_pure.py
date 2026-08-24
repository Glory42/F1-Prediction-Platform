import pytest

from src.utils.feature_helpers import car_rank, circuit_adj_start_pos


class TestCarRank:
    def test_no_team_id_returns_midfield(self):
        assert car_rank(None, {}) == 10.0

    def test_unknown_team_defaults_to_neutral_perf(self):
        # team_perf.get(team_id, 0.5) falls back to 0.5 for an unknown team
        assert car_rank(99, {}) == pytest.approx(20.0 - 0.5 * 19.0)

    def test_top_car_ranks_near_one(self):
        assert car_rank(1, {1: 1.0}) == pytest.approx(1.0)

    def test_worst_car_ranks_near_twenty(self):
        assert car_rank(1, {1: 0.0}) == pytest.approx(20.0)


class TestCircuitAdjStartPos:
    def test_high_overtake_low_sc_reduces_penalty(self):
        # overtake_rate=1.0 -> (1 + (1 - 1)) = 1x multiplier, no amplification
        result = circuit_adj_start_pos(0.5, overtake_rate=1.0, sc_probability=0.0)
        assert result == pytest.approx(0.5)

    def test_low_overtake_amplifies_start_pos_score(self):
        # overtake_rate=0.0 -> 2x multiplier before clamping
        result = circuit_adj_start_pos(0.4, overtake_rate=0.0, sc_probability=0.0)
        assert result == pytest.approx(0.8)

    def test_high_sc_probability_dampens_score(self):
        base = circuit_adj_start_pos(0.5, overtake_rate=1.0, sc_probability=0.0)
        with_sc = circuit_adj_start_pos(0.5, overtake_rate=1.0, sc_probability=1.0)
        assert with_sc < base
        assert with_sc == pytest.approx(0.5 * 0.7)

    def test_result_is_clamped_to_unit_range(self):
        result = circuit_adj_start_pos(1.0, overtake_rate=0.0, sc_probability=0.0)
        assert result <= 1.0
