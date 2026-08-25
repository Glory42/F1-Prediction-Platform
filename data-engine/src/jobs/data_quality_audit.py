"""
data_quality_audit — measures per-table data completeness/quality across the
database and writes the results to `data_quality_runs` + `data_quality_issues`.

Runs from Python because several checks read large per-lap tables
(`lap_times`, `sprint_lap_times`) where a row-count scan is the reliable signal —
the Hono API keeps the response side read-only, per the CLAUDE.md constraints.
"""
import json
from typing import Any

from psycopg2.extras import execute_batch

from src.db.client import get_conn
from src.utils.quality_utils import health_from_issues

# FP2 coverage below this triggers a flag — mirrors compute_features' fallback gate.
FP2_COVERAGE_GATE = 0.7
# Per-lap coverage below which a race is flagged. F1 fields normally retire mid-race,
# so ~70-85% of (drivers × circuit lap_count) is healthy; only flag clearly-degraded sets.
LAP_COVERAGE_GATE = 0.55

SPRINT_FORMATS = ("sprint", "sprint_qualifying", "sprint_shootout")


def _query(conn, sql: str, params=()) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return list(cur.fetchall())


def _scalar(conn, sql: str, params=()) -> Any:
    rows = _query(conn, sql, params)
    if not rows:
        return None
    key = list(rows[0].keys())[0]
    return rows[0][key]


def _load_races(conn, year: int | None, all_years: bool) -> list[dict]:
    where, params = ("TRUE", ())
    if not all_years and year is not None:
        where, params = "s.year = %s", (year,)
    return _query(
        conn,
        f"""
        SELECT r.id, r.round_number, r.name, r.status, r.event_format, r.season_id,
               s.year, COALESCE(c.lap_count, 0) AS lap_count,
               (SELECT COUNT(*) FROM qualifying_results WHERE race_id = r.id) AS quali_count,
               (SELECT COUNT(*) FROM race_results WHERE race_id = r.id) AS result_count
        FROM races r
        JOIN seasons s ON r.season_id = s.id
        LEFT JOIN circuits c ON r.circuit_id = c.id
        WHERE {where}
        ORDER BY s.year, r.round_number
        """,
        params,
    )


def _audit_race(conn, race: dict) -> tuple[list[dict], float]:
    issues: list[dict[str, Any]] = []
    race_id = race["id"]
    round_number = race["round_number"]
    year = race["year"]
    status = race["status"]
    is_sprint = race["event_format"] in SPRINT_FORMATS
    expected = max(race["quali_count"], race["result_count"], 0)
    lap_count = race.get("lap_count") or 0

    def add(table_name, check_name, severity, detail, fixable):
        issues.append({
            "race_id": race_id, "round_number": round_number, "year": year,
            "table_name": table_name, "check_name": check_name,
            "severity": severity, "detail": detail, "fixable": fixable,
            "is_sprint": is_sprint,
        })

    # ── qualifying_results ────────────────────────────────────────────────
    # Legacy eras (pre-2018) intentionally lack part of this data per data-pipeline
    # coverage, so only FastF1-era rounds are measured for qualifying quality.
    if status in ("qualifying_done", "completed") and year >= 2018:
        if race["quali_count"] < max(int(expected * 0.9), 1):
            add("qualifying_results", "row_count", "high",
                f"expected ~{expected} rows, found {race['quali_count']}", True)

        gaps = _scalar(conn, """
            SELECT string_agg(grid_position::text, ',')
            FROM (SELECT grid_position, COUNT(*) n
                  FROM qualifying_results WHERE race_id = %s
                  GROUP BY grid_position HAVING COUNT(*) > 1) t
            """, (race_id,))
        if gaps:
            add("qualifying_results", "grid_duplicates", "medium",
                f"duplicate grid positions: {gaps}", False)

        missing_times = _scalar(conn, """
            SELECT COUNT(*) FROM qualifying_results
            WHERE race_id = %s AND COALESCE(q1_time_ms, q2_time_ms, q3_time_ms, 0) = 0
            """, (race_id,))
        if missing_times:
            add("qualifying_results", "q_time_present", "medium",
                f"{missing_times} drivers with no Q time set", True)

        sector_cov = _scalar(conn, """
            SELECT AVG(frac) FROM (
                SELECT (COUNT(sector1_ms IS NOT NULL OR NULL) +
                        COUNT(sector2_ms IS NOT NULL OR NULL) +
                        COUNT(sector3_ms IS NOT NULL OR NULL)) / 3.0 AS frac
                FROM qualifying_results WHERE race_id = %s
            ) t
            """, (race_id,))
        if sector_cov is not None and sector_cov < 0.9:
            add("qualifying_results", "sector_times", "low",
                f"sector coverage {sector_cov:.0%}", False)

    # ── race_results ──────────────────────────────────────────────────────
    if status == "completed":
        if race["result_count"] < max(10, expected):
            add("race_results", "row_count", "high",
                f"expected ~{expected}, got {race['result_count']}", True)
        if not _scalar(conn, "SELECT 1 FROM race_results WHERE race_id = %s AND finish_position = 1",
                       (race_id,)):
            add("race_results", "winner_present", "high", "no finish_position=1 row", True)
        mp = _scalar(conn, "SELECT COUNT(*) FROM race_results WHERE race_id = %s AND points IS NULL",
                     (race_id,))
        if mp:
            add("race_results", "points_present", "low", f"{mp} drivers have NULL points", False)

    # ── lap_times (2018+) ─────────────────────────────────────────────────
    if status == "completed" and year >= 2018 and lap_count > 0:
        r = _query(conn, """
            SELECT COUNT(*) AS laps, COUNT(DISTINCT driver_id) AS drivers,
                   COUNT(*) FILTER (WHERE lap_time_ms IS NULL OR lap_time_ms <= 0) AS null_times
            FROM lap_times WHERE race_id = %s
            """, (race_id,))[0]
        drivers = r["drivers"]
        coverage = (r["laps"] / (drivers * lap_count)) if drivers else 0.0
        if coverage < LAP_COVERAGE_GATE:
            add("lap_times", "lap_coverage",
                "medium" if coverage >= 0.5 else "high",
                f"coverage {coverage:.0%} ({r['laps']} laps, expected ~{drivers}×{lap_count})",
                True)
        if r["null_times"]:
            add("lap_times", "lap_time_present", "low",
                f"{r['null_times']} laps missing lap_time_ms", False)

        if is_sprint:
            sr = _query(conn, """
                SELECT COUNT(DISTINCT (race_id || ':' || driver_id || ':' || lap_number)) AS n
                FROM sprint_lap_times WHERE race_id = %s
                """, (race_id,))[0]
            if not sr["n"]:
                add("sprint_lap_times", "lap_coverage", "low",
                    "no sprint laps ingested for a completed sprint weekend", True)

    # ── fp2_long_run_times (2018+, expected grid) ─────────────────────────
    # Sprint weekends replace FP2 with FP1 (no FP2 session exists), so only measure
    # conventional weekends — otherwise every sprint race is a permanent false positive.
    # FP2 is informational, not re-ingestable: drivers sometimes do no long-run stint, in
    # which case the model deliberately falls back to historical circuit pace (compute_features).
    if year >= 2018 and expected > 0 and not is_sprint:
        fp2_drivers = _scalar(conn,
            "SELECT COUNT(DISTINCT driver_id) FROM fp2_long_run_times WHERE race_id = %s",
            (race_id,)) or 0
        coverage = fp2_drivers / expected
        if coverage < FP2_COVERAGE_GATE:
            add("fp2_long_run_times", "driver_coverage", "low",
                f"FP2 long-run coverage {coverage:.0%} ({fp2_drivers}/~{expected} drivers); "
                f"model falls back to historical circuit pace", False)

    # ── season stats presence ─────────────────────────────────────────────
    if status == "completed":
        missing = _scalar(conn, """
            SELECT COUNT(*) FROM drivers d
            WHERE d.season_id = %s AND NOT EXISTS (
                SELECT 1 FROM driver_season_stats dss
                WHERE dss.driver_id = d.id AND dss.season_id = d.season_id
            )
            """, (race["season_id"],))
        if missing:
            add("driver_season_stats", "driver_presence", "medium",
                f"{missing} drivers missing season stats", True)

    # ── prediction pipeline (qualifying onwards) ──────────────────────────
    if status in ("qualifying_done", "completed"):
        fc = _scalar(conn,
            "SELECT COUNT(*) FROM driver_prediction_features WHERE race_id = %s", (race_id,)) or 0
        if fc < max(15, int(expected * 0.9)):
            add("driver_prediction_features", "feature_rows", "high",
                f"expected ~{expected} feature rows, got {fc}", True)
        prob_sum = _scalar(conn,
            "SELECT SUM(win_probability) FROM driver_prediction_features WHERE race_id = %s",
            (race_id,))
        if prob_sum is not None and abs(float(prob_sum) - 1.0) > 0.01:
            add("driver_prediction_features", "probability_sum", "medium",
                f"win_probability sums to {float(prob_sum):.3f}", False)
    if status == "completed" and not _scalar(
            conn, "SELECT 1 FROM race_predictions WHERE race_id = %s", (race_id,)):
        add("race_predictions", "prediction_present", "high",
            "completed race has no race_predictions row", True)

    health = health_from_issues(issues)
    return issues, health


def run(year: int | None = None, all_years: bool = False) -> None:
    conn = get_conn()
    try:
        races = _load_races(conn, year, all_years)
        all_issues: list[dict[str, Any]] = []
        total_health = 0.0
        for race in races:
            issues, health = _audit_race(conn, race)
            all_issues.extend(issues)
            total_health += health

        overall = round(total_health / len(races), 2) if races else 0.0
        summary = {
            "races_audited": len(races),
            "issue_count": len(all_issues),
            "fixable_count": sum(1 for i in all_issues if i["fixable"]),
            "by_severity": {
                sev: sum(1 for i in all_issues if i["severity"] == sev)
                for sev in ("high", "medium", "low")
            },
            "by_table": {},
        }
        for i in all_issues:
            summary["by_table"].setdefault(i["table_name"], 0)
            summary["by_table"][i["table_name"]] += 1

        # One aggregate run per audit pass (race_id NULL). `year_key` is the stored
        # year column value — a per-season scan stores the real year; an all-years scan
        # stores 0.
        year_key = year if not all_years and year is not None else 0
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO data_quality_runs (year, race_id, generated_at, health_score, summary) "
                "VALUES (%s, NULL, now(), %s, %s::jsonb) RETURNING id",
                (year_key, overall, json.dumps(summary)),
            )
            run_id = cur.fetchone()["id"]

        if all_issues:
            for issue in all_issues:
                issue["run_id"] = run_id
            cols = list(all_issues[0].keys())
            col_sql = ",".join('"{}"'.format(c) for c in cols)
            with conn.cursor() as cur:
                execute_batch(
                    cur,
                    "INSERT INTO data_quality_issues ({}) "
                    "VALUES ({})".format(col_sql, ",".join(["%s"] * len(cols))),
                    [[issue[c] for c in cols] for issue in all_issues],
                )

        # The dashboard shows only the latest run per year, so a fresh audit pass
        # supersedes (not accumulates with) earlier passes for the same year key.
        with conn.cursor() as cur:
            cur.execute("DELETE FROM data_quality_issues WHERE run_id IN "
                        "(SELECT id FROM data_quality_runs WHERE year = %s AND id != %s)",
                        (year_key, run_id))
            removed_issues = cur.rowcount
            cur.execute("DELETE FROM data_quality_runs WHERE year = %s AND id != %s",
                        (year_key, run_id))
            removed_runs = cur.rowcount
        conn.commit()
        if removed_runs:
            print(f"[data_quality_audit] pruned {removed_runs} stale run(s) "
                  f"({removed_issues} issues) for year_key={year_key}")
        print(f"[data_quality_audit] year={year} all={all_years} races={len(races)} "
              f"issues={len(all_issues)} health={overall}")
    finally:
        conn.close()