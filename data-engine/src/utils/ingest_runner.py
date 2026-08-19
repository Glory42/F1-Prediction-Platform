from dataclasses import dataclass, field
from typing import Any, Callable

from psycopg2.extras import execute_batch

from src.db.client import get_conn
from src.utils.driver_map import build_driver_code_map
from src.utils.fastf1_helpers import (
    get_sc_vsc_laps,
    get_session,
    get_weather,
    get_weather_details,
    session_to_lap_times,
    session_to_race_results,
    validate_session_data,
)
from src.utils.upsert import upsert


@dataclass(frozen=True)
class RaceContext:
    """Race row resolved for this ingest run, plus any job-specific extras
    (e.g. circuit_id for ingest_race) needed later by apply_conditions."""

    race_id: int
    season_id: int
    extra: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class IngestJobConfig:
    job_name: str
    session_type: str
    session_label: str
    results_table: str
    lap_times_table: str
    time_field: str
    results_row_label: str
    laps_row_label: str
    no_results_error: str
    resolve_race: Callable[[Any, int, int], RaceContext]
    apply_conditions: Callable[
        [Any, RaceContext, str, dict[str, float | None], dict[str, int]], None
    ]


def run_ingest_job(year: int, round_num: int, config: IngestJobConfig) -> None:
    print(f"[{config.job_name}] year={year} round={round_num}")

    conn = get_conn()
    try:
        race_ctx = config.resolve_race(conn, year, round_num)
        driver_map = build_driver_code_map(conn, race_ctx.season_id)

        session = get_session(year, round_num, config.session_type)

        if not validate_session_data(session, config.session_type):
            raise RuntimeError(
                f"{config.session_label} results not fully available or complete yet — retry later"
            )

        weather = get_weather(session)
        weather_details = get_weather_details(session)
        sc_vsc = get_sc_vsc_laps(session)
        result_rows = session_to_race_results(session)
        lap_time_rows = session_to_lap_times(session)

        headshot_updates: dict[int, str] = {}
        for rr in result_rows:
            if rr.get("headshot_url"):
                driver_id = driver_map.get(rr["driver_code"])
                if driver_id:
                    headshot_updates[driver_id] = rr["headshot_url"]

        if headshot_updates:
            with conn.cursor() as cur:
                execute_batch(
                    cur,
                    "UPDATE drivers SET headshot_url = %s WHERE id = %s AND headshot_url IS NULL",
                    [(url, driver_id) for driver_id, url in headshot_updates.items()],
                )
            print(f"  Updated {len(headshot_updates)} driver headshot URLs")

        results_to_upsert: list[dict[str, Any]] = []
        for rr in result_rows:
            driver_id = driver_map.get(rr["driver_code"])
            if not driver_id:
                print(f"  [warn] Unknown driver: {rr['driver_code']}")
                continue
            results_to_upsert.append({
                "race_id": race_ctx.race_id,
                "driver_id": driver_id,
                "finish_position": rr["finish_position"],
                "grid_position": rr["grid_position"],
                "points": rr["points"],
                "status": rr["status"],
                config.time_field: rr["total_race_time_ms"],
                "fastest_lap": rr["fastest_lap"],
            })

        if not results_to_upsert:
            raise RuntimeError(config.no_results_error.format(race_id=race_ctx.race_id))

        upsert(conn, config.results_table, results_to_upsert, ["race_id", "driver_id"])
        print(f"  Upserted {len(results_to_upsert)} {config.results_row_label} rows")

        laps_to_upsert: list[dict[str, Any]] = []
        for lt in lap_time_rows:
            driver_id = driver_map.get(lt["driver_code"])
            if not driver_id:
                continue
            laps_to_upsert.append({
                "race_id": race_ctx.race_id,
                "driver_id": driver_id,
                "lap_number": lt["lap_number"],
                "lap_time_ms": lt["lap_time_ms"],
                "sector1_ms": lt["sector1_ms"],
                "sector2_ms": lt["sector2_ms"],
                "sector3_ms": lt["sector3_ms"],
                "speed_st": lt["speed_st"],
                "compound": lt["compound"],
                "tyre_life": lt["tyre_life"],
                "fresh_tyre": lt["fresh_tyre"],
                "is_pit_lap": lt["is_pit_lap"],
                "stint_number": lt["stint_number"],
            })

        if laps_to_upsert:
            upsert(
                conn,
                config.lap_times_table,
                laps_to_upsert,
                ["race_id", "driver_id", "lap_number"],
            )
            print(f"  Upserted {len(laps_to_upsert)} {config.laps_row_label} rows")

        config.apply_conditions(conn, race_ctx, weather, weather_details, sc_vsc)

        conn.commit()

    finally:
        conn.close()
