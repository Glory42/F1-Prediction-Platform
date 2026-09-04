"""
Two seams, not one. `run_ingest_job`/`IngestJobConfig` process a full race/sprint session —
weather, SC/VSC, results, lap times, driver headshots. `run_qualifying_ingest_job`/
`QualifyingJobConfig` process only qualifying times — no weather, no laps, no headshots, no
SC/VSC. Forcing qualifying through the race/sprint shape would mean adding several always-None
fields to an already-wide config; instead each pair of jobs shares the seam that matches what it
actually does, and the qualifying/sprint-qualifying duplication that existed before this refactor
is gone too.
"""

from dataclasses import dataclass
from datetime import date
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
    session_to_quali_results,
    session_to_race_results,
    validate_session_data,
)
from src.utils.upsert import upsert


@dataclass(frozen=True)
class RaceContext:
    """Race row resolved for this ingest run. circuit_id is set only by ingest_race
    (needed for the circuits.sc_probability recompute); it stays None for ingest_sprint,
    which has no cross-table effect."""

    race_id: int
    season_id: int
    circuit_id: int | None = None


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
    mark_status: Callable[[Any, RaceContext, str, dict[str, float | None], dict[str, int]], None]
    # Runs after mark_status, for side effects on tables OTHER than `races` (e.g. ingest_race's
    # circuits.sc_probability recompute). Kept separate so a cross-table write is a visible, named
    # step instead of buried inside one opaque callback that also owns the races write.
    cross_table_hook: Callable[[Any, RaceContext], None] | None = None


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

        config.mark_status(conn, race_ctx, weather, weather_details, sc_vsc)
        if config.cross_table_hook is not None:
            # Must run after mark_status: it reads races.status='completed', written above
            # in this same (uncommitted) transaction.
            config.cross_table_hook(conn, race_ctx)

        conn.commit()

    finally:
        conn.close()


@dataclass(frozen=True)
class QualifyingContext:
    race_id: int
    season_id: int
    event_format: str
    quali_day: date | None


@dataclass(frozen=True)
class QualifyingJobConfig:
    job_name: str
    results_table: str
    results_row_label: str
    allowed_event_formats: frozenset[str]
    format_error: str  # .format(round_num=, event_format=)
    date_guard_error: str  # .format(year=, round_num=, day=)
    no_results_error: str  # .format(year=, round_num=, race_id=) — superset kwargs; each job's
    # template only uses the ones it needs
    session_type_for: Callable[[str], str]
    resolve_race: Callable[[Any, int, int], QualifyingContext]
    rows_from_quali: Callable[[list[dict[str, Any]], dict[str, int], int], list[dict[str, Any]]]
    new_status: str
    status_guard: tuple[str, ...]
    exclude_update: list[str] | None = None


def run_qualifying_ingest_job(year: int, round_num: int, config: QualifyingJobConfig) -> None:
    print(f"[{config.job_name}] year={year} round={round_num}")

    conn = get_conn()
    try:
        ctx = config.resolve_race(conn, year, round_num)

        if ctx.quali_day is not None and ctx.quali_day > date.today():
            raise RuntimeError(
                config.date_guard_error.format(year=year, round_num=round_num, day=ctx.quali_day)
            )

        if ctx.event_format not in config.allowed_event_formats:
            raise ValueError(
                config.format_error.format(round_num=round_num, event_format=ctx.event_format)
            )

        session_type = config.session_type_for(ctx.event_format)
        print(f"  event_format={ctx.event_format} — ingesting {session_type} session")

        driver_map = build_driver_code_map(conn, ctx.season_id)
        session = get_session(year, round_num, session_type, messages=True)
        quali_rows = session_to_quali_results(session)

        rows = config.rows_from_quali(quali_rows, driver_map, ctx.race_id)
        if not rows:
            raise RuntimeError(
                config.no_results_error.format(year=year, round_num=round_num, race_id=ctx.race_id)
            )

        upsert(conn, config.results_table, rows, ["race_id", "driver_id"], exclude_update=config.exclude_update)
        print(f"  Upserted {len(rows)} {config.results_row_label} rows")

        with conn.cursor() as cur:
            cur.execute(
                "UPDATE races SET status = %s WHERE id = %s AND status IN %s",
                (config.new_status, ctx.race_id, tuple(config.status_guard)),
            )
        conn.commit()
        print(f"  Race {ctx.race_id} status → {config.new_status}")

    finally:
        conn.close()
