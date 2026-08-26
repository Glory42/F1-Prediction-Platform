from typing import Any

# Severity -> points deducted from a per-race 100 health baseline.
SEVERITY_POINTS = {"high": 8, "medium": 4, "low": 1}


def health_from_issues(issues: list[dict[str, Any]]) -> float:
    """Per-race health: start at 100 and subtract severity points, floor 0."""
    penalty = sum(SEVERITY_POINTS.get(i["severity"], 0) for i in issues)
    return max(0.0, 100.0 - min(penalty, 100.0))


def resolve_issue_actions(issue: dict[str, Any]) -> list[str]:
    """Map one fixable issue row to the ordered job names that resolve it.

    Order matters — ingest first, then recompute downstream things that depend
    on the new rows. Returns [] when the issue has no repair path ('' not fixable'').
    """
    table = issue.get("table_name")
    check = issue.get("check_name")
    if table == "qualifying_results" and check in ("row_count", "q_time_present"):
        return ["ingest_qualifying", "compute_features", "compute_predictions"]
    if table == "race_results" and check in ("row_count", "points_present", "winner_present"):
        return ["ingest_race", "compute_season_stats"]
    if table == "lap_times" and check in ("lap_coverage", "lap_time_present"):
        return ["ingest_race", "compute_features", "compute_predictions"]
    if table == "sprint_results" and check == "row_count":
        return ["ingest_sprint", "compute_season_stats"]
    if table == "sprint_lap_times" and check == "lap_coverage":
        return ["ingest_sprint"]
    if table == "driver_prediction_features" and check == "feature_rows":
        return ["compute_features", "compute_predictions"]
    if table == "race_predictions" and check == "prediction_present":
        return ["compute_predictions"]
    if table == "driver_season_stats" and check == "driver_presence":
        return ["compute_season_stats"]
    return []
