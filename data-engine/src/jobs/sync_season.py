import fastf1
from src.db.client import get_conn
from src.utils.upsert import upsert


def run(year: int, round_num: int = 1) -> None:
    """
    Syncs teams and drivers from a specific round's session data.
    Defaults to round 1 — run again with a different round if drivers changed mid-season.
    """
    print(f"[sync_season] year={year} round={round_num}")

    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM seasons WHERE year = %s", (year,))
            row = cur.fetchone()
        if not row:
            raise ValueError(f"Season {year} not found")
        season_id = row["id"]

        session = fastf1.get_session(year, round_num, "R")
        session.load(laps=False, telemetry=False, weather=False, messages=False)

        # Build teams list from driver data
        teams_seen: dict[str, dict] = {}
        drivers_raw: list[dict] = []

        for drv_num in session.drivers:
            info = session.get_driver(drv_num)

            team_name = str(info.get("TeamName", "Unknown"))
            team_key = team_name.lower().replace(" ", "_").replace("-", "_").replace(".", "")

            if team_key not in teams_seen:
                teams_seen[team_key] = {
                    "season_id": season_id,
                    "team_key": team_key,
                    "name": team_name,
                    "nationality": None,
                }

            full_name = str(info.get("FullName", f"Driver {drv_num}"))
            parts = full_name.split(" ", 1)
            first_name = parts[0]
            last_name = parts[1] if len(parts) > 1 else ""

            try:
                driver_number = int(info.get("DriverNumber", 0))
            except (ValueError, TypeError):
                driver_number = 0

            drivers_raw.append({
                "season_id": season_id,
                "team_key": team_key,
                "driver_number": driver_number,
                "code": str(info.get("Abbreviation", drv_num[:3])).upper()[:3],
                "first_name": first_name,
                "last_name": last_name,
                "nationality": str(info.get("CountryCode", "")) or None,
            })

        # Upsert teams first
        upsert(conn, "teams", list(teams_seen.values()), ["season_id", "team_key"])
        print(f"  Synced {len(teams_seen)} teams")

        # Reload team_key → id map
        with conn.cursor() as cur:
            cur.execute("SELECT id, team_key FROM teams WHERE season_id = %s", (season_id,))
            team_id_map: dict[str, int] = {r["team_key"]: r["id"] for r in cur.fetchall()}

        # Resolve team_id for each driver
        drivers_to_upsert = []
        for d in drivers_raw:
            team_id = team_id_map.get(d["team_key"])
            if not team_id:
                print(f"  [warn] team_id not found for {d['code']} (team_key={d['team_key']})")
                continue
            drivers_to_upsert.append({
                "season_id": season_id,
                "team_id": team_id,
                "driver_number": d["driver_number"],
                "code": d["code"],
                "first_name": d["first_name"],
                "last_name": d["last_name"],
                "nationality": d["nationality"],
            })

        if drivers_to_upsert:
            upsert(conn, "drivers", drivers_to_upsert, ["season_id", "driver_number"])
            print(f"  Synced {len(drivers_to_upsert)} drivers")

    finally:
        conn.close()
