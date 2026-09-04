import json
from pathlib import Path

import pytest

from src.jobs.compute_features import WEIGHTS as GP_WEIGHTS
from src.jobs.compute_sprint_features import WEIGHTS as SPRINT_WEIGHTS
from src.utils.feature_manifest import GP_FEATURES, SPRINT_FEATURES, assemble_scores

# Guards the exact regression risk the model relies on manual review to catch today:
# an edit to one weight during a refactor silently breaking the sum-to-1 invariant that
# the raw_weighted_score / softmax pipeline assumes.

FEATURE_WEIGHTS_JSON = Path(__file__).resolve().parents[2] / "docs" / "feature-weights.json"


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


def test_assemble_scores_matches_gp_manifest_keys():
    values = {f.name: 0.5 for f in GP_FEATURES}
    assert set(assemble_scores(values, GP_FEATURES).keys()) == set(GP_WEIGHTS.keys())


def test_assemble_scores_matches_sprint_manifest_keys():
    values = {f.name: 0.5 for f in SPRINT_FEATURES}
    assert set(assemble_scores(values, SPRINT_FEATURES).keys()) == set(SPRINT_WEIGHTS.keys())


def test_assemble_scores_raises_when_a_gp_feature_is_missing():
    values = {f.name: 0.5 for f in GP_FEATURES if f.name != "car_performance"}
    with pytest.raises(KeyError):
        assemble_scores(values, GP_FEATURES)


def test_assemble_scores_raises_when_a_sprint_feature_is_missing():
    values = {f.name: 0.5 for f in SPRINT_FEATURES if f.name != "car_performance"}
    with pytest.raises(KeyError):
        assemble_scores(values, SPRINT_FEATURES)


def test_gp_weights_match_shared_json_fixture():
    fixture = json.loads(FEATURE_WEIGHTS_JSON.read_text())
    assert {k: round(v * 100) for k, v in GP_WEIGHTS.items()} == fixture["gp"]


def test_sprint_weights_match_shared_json_fixture():
    fixture = json.loads(FEATURE_WEIGHTS_JSON.read_text())
    assert {k: round(v * 100) for k, v in SPRINT_WEIGHTS.items()} == fixture["sprint"]
