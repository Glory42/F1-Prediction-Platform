from dataclasses import dataclass
from typing import Any, Callable


@dataclass
class FeatureContext:
    """Shared pre-divergence context for the GP and sprint feature jobs. Grid source
    differs by model, so build_feature_context() takes it as a parameter."""

    race_id: int
    season_id: int
    circuit_id: int
    weather: str | None
    sprint_weather: str | None
    event_format: str | None
    overtake_rate: float
    sc_probability: float
    circuit_category: str | None
    driver_ids: list[int]
    grid_map: dict[int, int]
    start_pos_map: dict[int, float]
    stats_rows: dict[int, dict[str, Any]]
    team_data: dict[int, dict[str, float]]
    team_perf: dict[int, float]


def build_feature_context(
    conn: Any,
    race_id: int,
    *,
    grid_table: str,
    grid_not_found_message: str,
    validate_race: Callable[[dict[str, Any]], None] | None = None,
) -> FeatureContext:
    """`grid_table` is `qualifying_results` (GP) or `sprint_results` (sprint). `validate_race`
    runs before the grid lookup so its error outranks a "no grid rows" error."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT r.id, r.season_id, r.weather, r.sprint_weather, r.circuit_id, r.event_format, "
            "       c.overtake_rate, c.sc_probability, c.track_category "
            "FROM races r JOIN circuits c ON r.circuit_id = c.id "
            "WHERE r.id = %s",
            (race_id,),
        )
        race = cur.fetchone()
    if not race:
        raise ValueError(f"Race {race_id} not found")

    if validate_race is not None:
        validate_race(race)

    season_id = race["season_id"]
    overtake_rate = float(race["overtake_rate"]) if race["overtake_rate"] is not None else 0.5
    sc_probability = float(race["sc_probability"]) if race["sc_probability"] is not None else 0.3

    with conn.cursor() as cur:
        cur.execute(
            f"SELECT g.driver_id, g.grid_position FROM {grid_table} g WHERE g.race_id = %s",
            (race_id,),
        )
        grid_rows = cur.fetchall()

    if not grid_rows:
        raise ValueError(grid_not_found_message)

    driver_ids = [r["driver_id"] for r in grid_rows]
    grid_map = {r["driver_id"]: r["grid_position"] for r in grid_rows}
    start_pos_map = {d: (21 - grid_map.get(d, 20)) / 20.0 for d in driver_ids}

    with conn.cursor() as cur:
        cur.execute(
            "SELECT dss.driver_id, dss.races_entered, dss.wins, dss.total_points, "
            "       dss.avg_position_gain, dss.dnf_rate, dss.teammate_quali_delta, "
            "       dss.sprint_races_entered, dss.sprint_wins, dss.sprint_total_points, "
            "       d.team_id "
            "FROM driver_season_stats dss "
            "JOIN drivers d ON dss.driver_id = d.id "
            "WHERE dss.season_id = %s AND dss.driver_id = ANY(%s)",
            (season_id, driver_ids),
        )
        stats_rows = {r["driver_id"]: r for r in cur.fetchall()}

    with conn.cursor() as cur:
        cur.execute(
            "SELECT t.id AS team_id, tss.car_performance_score, tss.reliability_score "
            "FROM team_season_stats tss JOIN teams t ON tss.team_id = t.id "
            "WHERE tss.season_id = %s",
            (season_id,),
        )
        team_data = {
            r["team_id"]: {
                "car_perf": float(r["car_performance_score"]) if r["car_performance_score"] else 0.5,
                "reliability": float(r["reliability_score"]) if r["reliability_score"] else 0.5,
            }
            for r in cur.fetchall()
        }

    team_perf = {tid: v["car_perf"] for tid, v in team_data.items()}

    return FeatureContext(
        race_id=race_id,
        season_id=season_id,
        circuit_id=race["circuit_id"],
        weather=race["weather"],
        sprint_weather=race["sprint_weather"],
        event_format=race["event_format"],
        overtake_rate=overtake_rate,
        sc_probability=sc_probability,
        circuit_category=race.get("track_category"),
        driver_ids=driver_ids,
        grid_map=grid_map,
        start_pos_map=start_pos_map,
        stats_rows=stats_rows,
        team_data=team_data,
        team_perf=team_perf,
    )
