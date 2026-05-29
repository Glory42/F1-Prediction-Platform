import fastf1
from src.db.client import get_conn
from src.utils.upsert import upsert

# FastF1 uses Location (city-level) — map to our circuit_key
LOCATION_TO_CIRCUIT_KEY: dict[str, str] = {
    "Sakhir": "bahrain",
    "Jeddah": "jeddah",
    "Melbourne": "albert_park",
    "Suzuka": "suzuka",
    "Shanghai": "shanghai",
    "Miami": "miami",
    "Miami Gardens": "miami",          # FastF1 2025 uses this name
    "Imola": "imola",
    "Monte Carlo": "monaco",
    "Monaco": "monaco",                # FastF1 sometimes uses this
    "Montréal": "canada",
    "Montreal": "canada",              # ASCII fallback
    "Barcelona": "catalunya",
    "Spielberg": "red_bull_ring",
    "Silverstone": "silverstone",
    "Budapest": "hungaroring",
    "Spa-Francorchamps": "spa",
    "Zandvoort": "zandvoort",
    "Monza": "monza",
    "Baku": "baku",
    "Marina Bay": "singapore",
    "Austin": "austin",
    "Mexico City": "mexico_city",
    "São Paulo": "interlagos",
    "Las Vegas": "las_vegas",
    "Lusail": "lusail",
    "Yas Island": "yas_marina",
    "Portimão": "portimao",
    "Sochi": "sochi",
    "Istanbul": "istanbul",
    "Le Castellet": "paul_ricard",
    "Madrid": "madrid",
    "Miami Gardens": "miami",
    "Yas Marina": "yas_marina",
    # 2018-2020 historical
    "Hockenheim": "hockenheim",
    "Nürburg": "nurburgring",
    "Nürburgring": "nurburgring",
    "Mugello": "mugello",
    "Singapore": "singapore",
    "São Paulo": "interlagos",
    "Sao Paulo": "interlagos",
    "Abu Dhabi": "yas_marina",
    # 2000-2017 historical
    "Spa": "spa",
    "Spa-Francorchamps": "spa",
    "Magny Cours": "magny_cours",       # FastF1 omits hyphen
    "Magny-Cours": "magny_cours",
    "Oyama": "fuji_speedway",           # Japanese GP at Fuji 2007-2008
    "Yeongam County": "korea",
    "Uttar Pradesh": "india",
    "Kuala Lumpur": "sepang",
    "Sepang": "sepang",
    "Indianapolis": "indianapolis",
    "Magny-Cours": "magny_cours",
    "Spielberg": "a1_ring",        # pre-2004 A1-Ring (same location as Red Bull Ring)
    "Valencia": "valencia",
    "Yeongam": "korea",
    "Greater Noida": "india",
    "New Delhi": "india",
    "Imola": "imola",              # already in dict above but added for clarity
    "Bahrain": "bahrain",          # alternate location name
    "Shanghai": "shanghai",        # already above
    "Suzuka": "suzuka",            # already above
    "Interlagos": "interlagos",
    "Melbourne": "albert_park",    # already above
    "Monte Carlo": "monaco",       # already above
    "Montreal": "canada",          # already above
}


def run(year: int) -> None:
    print(f"[sync_schedule] year={year}")

    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM seasons WHERE year = %s", (year,))
            row = cur.fetchone()
        if not row:
            raise ValueError(f"Season {year} not found — run db:seed first")
        season_id = row["id"]

        with conn.cursor() as cur:
            cur.execute("SELECT id, circuit_key FROM circuits")
            circuit_map: dict[str, int] = {r["circuit_key"]: r["id"] for r in cur.fetchall()}

        schedule = fastf1.get_event_schedule(year, include_testing=False)

        rows_to_upsert = []
        for _, event in schedule.iterrows():
            location = str(event.get("Location", ""))
            circuit_key = LOCATION_TO_CIRCUIT_KEY.get(location)

            if not circuit_key:
                print(f"  [warn] No circuit_key mapping for Location='{location}' (Round {event['RoundNumber']})")
                continue

            circuit_id = circuit_map.get(circuit_key)
            if not circuit_id:
                print(f"  [warn] circuit_key '{circuit_key}' not in DB — run db:seed first")
                continue

            event_date = event["EventDate"]
            race_date = event_date.date().isoformat() if hasattr(event_date, "date") else str(event_date)[:10]

            rows_to_upsert.append({
                "season_id": season_id,
                "circuit_id": circuit_id,
                "round_number": int(event["RoundNumber"]),
                "name": str(event["EventName"]),
                "race_date": race_date,
                "status": "scheduled",
            })

        if rows_to_upsert:
            upsert(conn, "races", rows_to_upsert, ["season_id", "round_number"])
            print(f"  Synced {len(rows_to_upsert)} races for {year}")
        else:
            print("  No races synced — check LOCATION_TO_CIRCUIT_KEY mapping")

    finally:
        conn.close()
