"""
data_quality_repair — resolves open, fixable gaps reported by data_quality_audit.

The audit only *measures* and marks issues `fixable=true`; this job actually closes
them. Each issue maps to the ingest job that owns that table's data (per the source
matrix in docs/data-pipeline.md), and after ingesting it recomputes whatever the
downstream model needs so the fix reaches `driver_prediction_features` / predictions.

Because several fixes need a full re-ingest of a race (lap_times, results), the
repair intentionally re-runs the ingest job for the whole race, then recomputes
features, predictions, and (when results changed) season stats — exactly like the
auto_runner chain would have done.

Run:  python src/main.py --job data_quality_repair [--year N] [--resolve <run_id>]
By default it repairs the latest unresolve audit run for the given (or current) year.

Source ownership (which table each ingest fixes):
  ingest_fp2           -> fp2_long_run_times
  ingest_qualifying    -> qualifying_results (and sector/q-times)
  ingest_race          -> race_results + lap_times
  ingest_sprint_qual   -> sprint_results (SQ) -> driver_sprint_features
  ingest_sprint        -> sprint_results + sprint_lap_times
  compute_*            -> driver_prediction_features / season stats / predictions
"""
import sys
from typing import Any

from src.db.client import get_conn
from src.utils.quality_utils import resolve_issue_actions
from src.jobs import (
    ingest_fp2, ingest_qualifying, ingest_race,
    ingest_sprint, ingest_sprint_qualifying,
    compute_features, compute_predictions, compute_season_stats,
)


def _run_ingest(conn, issue: dict[str, Any], step: str) -> None:
    """Run a single ingest/recompute step for the issue's race."""
    year = issue["year"]
    # resolve the round number if only race_id is stored
    round_num = issue.get("round_number")
    race_id = issue.get("race_id")
    if not round_num and race_id:
        with conn.cursor() as cur:
            cur.execute("SELECT round_number FROM races WHERE id = %s", (race_id,))
            row = cur.fetchone()
            round_num = row["round_number"] if row else None
    if not round_num:
        raise ValueError(f"cannot resolve round for issue race {race_id}")
    if round_num is None or year is None:
        raise ValueError("resolve needs year/round")

    if step == "ingest_fp2":
        ingest_fp2.run(year, round_num)
    elif step == "ingest_qualifying":
        ingest_qualifying.run(year, round_num)
    elif step == "ingest_race":
        ingest_race.run(year, round_num)
    elif step == "ingest_sprint_qualifying":
        ingest_sprint_qualifying.run(year, round_num)
    elif step == "ingest_sprint":
        ingest_sprint.run(year, round_num)
    elif step == "compute_features":
        if not race_id:
            raise ValueError("compute_features needs race_id")
        compute_features.run(race_id)
    elif step == "compute_predictions":
        if not race_id:
            raise ValueError("compute_predictions needs race_id")
        compute_predictions.run(race_id)
    elif step == "compute_season_stats":
        compute_season_stats.run(year)


def run(year: int, resolve_run: int | None = None) -> None:
    conn = get_conn()
    try:
        # find the audit run we're acting on: explicit, else latest for the year
        if resolve_run:
            base_sql = "SELECT id FROM data_quality_runs WHERE id=%s"
            params = (resolve_run,)
        else:
            base_sql = ("SELECT id FROM data_quality_runs WHERE year=%s "
                        "ORDER BY generated_at DESC LIMIT 1")
            params = (int(year),)

        with conn.cursor() as cur:
            cur.execute(base_sql, params)
            row = cur.fetchone()
        if not row:
            print(f"[data_quality_repair] no audit run for year={year} resolve={resolve_run}; nothing to do")
            return
        run_id = row["id"]

        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, race_id, round_number, year, table_name, check_name, "
                "severity, detail, fixable, is_sprint "
                "FROM data_quality_issues WHERE run_id=%s AND fixable=true",
                (run_id,),
            )
            issues = cur.fetchall()
        if not issues:
            print(f"[data_quality_repair] run {run_id}: no fixable issues")
            return

        print(f"[data_quality_repair] run {run_id}: {len(issues)} fixable issues")
        # Dedupe by race: a race with several related issues must not re-run the full
        # ingest + recompute chain once per issue. Group fixable issues by race, union
        # their repair steps in first-seen order, execute each group once, then resolve.
        skipped = 0
        grouped: dict[tuple, dict] = {}
        for issue in issues:
            steps = resolve_issue_actions(issue)
            if not steps:
                print(f"  [skip] no repair path for {issue['table_name']}.{issue['check_name']}")
                skipped += 1
                continue
            key = (issue["round_number"], issue["race_id"])
            group = grouped.setdefault(key, {"issues": [], "steps": []})
            group["issues"].append(issue)
            for s in steps:
                if s not in group["steps"]:
                    group["steps"].append(s)

        fixed = failed = 0
        for key, group in grouped.items():
            round_num, race_id = key
            steps = group["steps"]
            try:
                for step in steps:
                    _run_ingest(conn, group["issues"][0], step)
                for issue in group["issues"]:
                    with conn.cursor() as cur:
                        cur.execute("UPDATE data_quality_issues SET resolved=true WHERE id=%s",
                                    (issue["id"],))
                    conn.commit()
                    fixed += 1
                print(f"  [OK] race={round_num or race_id} steps={','.join(steps)} "
                      f"resolved {len(group['issues'])} issue(s)")
            except Exception as e:
                conn.rollback()
                print(f"  [FAIL] race={round_num or race_id} steps={','.join(steps)}: {e}")
                failed += len(group["issues"])
        print(f"[data_quality_repair] done: fixed={fixed} failed={failed} skipped={skipped}")
    finally:
        conn.close()