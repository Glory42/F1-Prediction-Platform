from src.utils.prediction_runner import run_prediction_job


def run(race_id: int) -> None:
    run_prediction_job(
        race_id,
        job_name="compute_predictions",
        feature_table="driver_prediction_features",
        prediction_table="race_predictions",
        model_version="weighted-v3",
        not_found_error=f"No feature rows found for race {race_id}",
        winner_label="Predicted winner",
    )
