from datetime import datetime, timezone
from psycopg2.extras import execute_batch
from src.db.client import get_conn
from src.utils.math_utils import softmax


def run(race_id: int) -> None:
    print(f"[compute_predictions] race_id={race_id}")

    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT driver_id, raw_weighted_score FROM driver_prediction_features "
                "WHERE race_id = %s ORDER BY driver_id",
                (race_id,),
            )
            feature_rows = cur.fetchall()

        if not feature_rows:
            raise ValueError(f"No feature rows found for race {race_id}")

        driver_ids = [r["driver_id"] for r in feature_rows]
        raw_scores = [float(r["raw_weighted_score"]) for r in feature_rows]

        probabilities = softmax(raw_scores, temperature=0.3)
        assert abs(sum(probabilities) - 1.0) < 1e-4, "Probabilities do not sum to 1"

        # Rank: position 1 = highest probability
        sorted_indices = sorted(range(len(probabilities)), key=lambda i: probabilities[i], reverse=True)
        position_map = {driver_ids[sorted_indices[rank]]: rank + 1 for rank in range(len(driver_ids))}
        predicted_winner_id = driver_ids[sorted_indices[0]]

        with conn.cursor() as cur:
            update_rows = [
                (round(probabilities[i], 5), position_map[driver_id], race_id, driver_id)
                for i, driver_id in enumerate(driver_ids)
            ]
            execute_batch(
                cur,
                "UPDATE driver_prediction_features "
                "SET win_probability = %s, predicted_position = %s "
                "WHERE race_id = %s AND driver_id = %s",
                update_rows,
            )

            cur.execute(
                """
                INSERT INTO race_predictions (race_id, predicted_winner_id, computed_at, model_version)
                VALUES (%s, %s, %s, 'weighted-v3')
                ON CONFLICT (race_id) DO UPDATE SET
                    predicted_winner_id = EXCLUDED.predicted_winner_id,
                    computed_at = EXCLUDED.computed_at,
                    model_version = EXCLUDED.model_version
                """,
                (race_id, predicted_winner_id, datetime.now(timezone.utc)),
            )

        conn.commit()
        print(f"  Predicted winner: driver_id={predicted_winner_id} "
              f"(p={round(probabilities[sorted_indices[0]], 3)})")

    finally:
        conn.close()
