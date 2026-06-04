"""
Legacy qualifying ingest for pre-2018 seasons.
Uses Ergast data via FastF1 — grid positions and Q times where available.
Pre-2006: single-lap qualifying (no Q1/Q2/Q3 split).
2006+: Q1/Q2/Q3 format.
"""
import fastf1
import pandas as pd
from typing import Any
from src.db.client import get_conn
from src.utils.upsert import upsert
from src.utils.fastf1_helpers import ms_to_int as _ms


def _get_session(year: int, round_num: int) -> Any:
    session = fastf1.get_session(year, round_num, "Q")
    session.load(laps=False, telemetry=False, weather=False, messages=False)
    return session


def run(year: int, round_num: int) -> None:
    print(f"[ingest_qualifying_legacy] year={year} round={round_num}")

    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT r.id, r.season_id FROM races r "
                "JOIN seasons s ON r.season_id = s.id "
                "WHERE s.year = %s AND r.round_number = %s",
                (year, round_num),
            )
            race_row = cur.fetchone()
        if not race_row:
            raise ValueError(f"Race not found for year={year} round={round_num}")

        race_id = race_row["id"]
        season_id = race_row["season_id"]

        with conn.cursor() as cur:
            cur.execute("SELECT id, code FROM drivers WHERE season_id = %s", (season_id,))
            driver_map: dict[str, int] = {row["code"]: row["id"] for row in cur.fetchall()}

        session = _get_session(year, round_num)

        if session.results is None or session.results.empty:
            print("  No qualifying data available — skipping")
            return

        rows_to_upsert = []
        for _, row in session.results.iterrows():
            if pd.isna(row.get("Position")):
                continue
            code = str(row.get("Abbreviation", "")).upper()
            if not code:
                continue
            driver_id = driver_map.get(code)
            if not driver_id:
                print(f"  [warn] Unknown driver: {code}")
                continue

            grid_pos = int(row["Position"])

            # Q1/Q2/Q3 available from 2006+ via Ergast
            q1 = _ms(row.get("Q1"))
            q2 = _ms(row.get("Q2"))
            q3 = _ms(row.get("Q3"))

            # Pre-2006: single best lap → store as Q1
            if q1 is None and q2 is None and q3 is None:
                q1 = _ms(row.get("Time"))

            rows_to_upsert.append({
                "race_id": race_id,
                "driver_id": driver_id,
                "grid_position": grid_pos,
                "q1_time_ms": q1,
                "q2_time_ms": q2,
                "q3_time_ms": q3,
                "sector1_ms": None,
                "sector2_ms": None,
                "sector3_ms": None,
                "speed_st": None,
            })

        if rows_to_upsert:
            upsert(conn, "qualifying_results", rows_to_upsert, ["race_id", "driver_id"])
            print(f"  Upserted {len(rows_to_upsert)} qualifying rows")

        with conn.cursor() as cur:
            cur.execute(
                "UPDATE races SET status = 'qualifying_done' WHERE id = %s AND status = 'scheduled'",
                (race_id,),
            )
        conn.commit()

    finally:
        conn.close()
