import pytest

from src.jobs.compute_features import WEIGHTS as GP_WEIGHTS
from src.jobs.compute_sprint_features import WEIGHTS as SPRINT_WEIGHTS

# Guards the exact regression risk the model relies on manual review to catch today:
# an edit to one weight during a refactor silently breaking the sum-to-1 invariant that
# the raw_weighted_score / softmax pipeline assumes.


@pytest.mark.parametrize("weights", [GP_WEIGHTS, SPRINT_WEIGHTS], ids=["gp", "sprint"])
def test_weights_sum_to_one(weights):
    assert sum(weights.values()) == pytest.approx(1.0, abs=1e-9)


@pytest.mark.parametrize("weights", [GP_WEIGHTS, SPRINT_WEIGHTS], ids=["gp", "sprint"])
def test_all_weights_positive(weights):
    assert all(w > 0 for w in weights.values())


def test_gp_weights_has_twelve_features():
    assert len(GP_WEIGHTS) == 12


def test_sprint_weights_has_eight_features():
    assert len(SPRINT_WEIGHTS) == 8
