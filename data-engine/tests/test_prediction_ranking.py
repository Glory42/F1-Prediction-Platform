from src.utils.prediction_runner import rank_by_probability


def test_highest_probability_gets_position_one():
    position_map, winner_id = rank_by_probability([1, 2, 3], [0.2, 0.5, 0.3])
    assert position_map[2] == 1
    assert winner_id == 2


def test_full_ordering_across_field():
    position_map, _ = rank_by_probability([10, 20, 30, 40], [0.1, 0.4, 0.05, 0.45])
    assert position_map == {40: 1, 20: 2, 10: 3, 30: 4}


def test_predicted_winner_matches_rank_one_driver():
    driver_ids = [7, 8, 9]
    probabilities = [0.6, 0.1, 0.3]
    position_map, winner_id = rank_by_probability(driver_ids, probabilities)
    rank_one_driver = next(d for d, pos in position_map.items() if pos == 1)
    assert winner_id == rank_one_driver == 7


def test_single_driver_field():
    position_map, winner_id = rank_by_probability([5], [1.0])
    assert position_map == {5: 1}
    assert winner_id == 5
