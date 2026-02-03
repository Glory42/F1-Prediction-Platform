import fastf1
import sys
import os

# Add parent directory to path to allow importing utils
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.supabase_client import supabase

def sync_season_data(year: int):
    print(f"🔄 Syncing Season Entries for {year}...")
    
    # Check schedule first
    try:
        schedule = fastf1.get_event_schedule(year)
    except Exception as e:
        print(f"❌ Failed to get schedule: {e}")
        return

    # To get driver-team mappings, we need to load a session.
    # We will load Round 1.
    print(f"   Loading Round 1 session data...")
    try:
        session = fastf1.get_session(year, 1, 'R')
        session.load(laps=False, telemetry=False, weather=False, messages=False)
    except Exception as e:
        print(f"❌ Failed to load session: {e}")
        return

    drivers_to_upsert = []
    teams_to_upsert = []
    entries_to_upsert = []
    
    # Track unique IDs to avoid duplicates in list
    seen_drivers = set()
    seen_teams = set()
    # Track existing teams in DB to preserve IDs if they exist? 
    # For now, we assume ID is slugified name.

    for drv in session.drivers:
        info = session.get_driver(drv)
        
        # Prepare Driver
        driver_id = str(info['Abbreviation']).lower()
        if driver_id not in seen_drivers:
            drivers_to_upsert.append({
                "id": driver_id,
                "full_name": info['FullName'],
                "number": int(info['DriverNumber']) if info['DriverNumber'] else None
            })
            seen_drivers.add(driver_id)
        
        # Prepare Team
        team_name = info['TeamName']
        team_id = team_name.lower().replace(" ", "-")
        if team_id not in seen_teams:
            teams_to_upsert.append({
                "id": team_id,
                "name": team_name
            })
            seen_teams.add(team_id)
            
        # Prepare Season Entry
        entries_to_upsert.append({
            "year": year,
            "driver_id": driver_id,
            "team_id": team_id
        })

    # 1. Upsert Teams
    if teams_to_upsert:
        print(f"   💾 Upserting {len(teams_to_upsert)} teams...")
        supabase.table("teams").upsert(teams_to_upsert).execute()

    # 2. Upsert Drivers
    if drivers_to_upsert:
        print(f"   💾 Upserting {len(drivers_to_upsert)} drivers...")
        supabase.table("drivers").upsert(drivers_to_upsert).execute()

    # 3. Upsert Season Entries
    if entries_to_upsert:
        print(f"   💾 Upserting {len(entries_to_upsert)} season entries...")
        # Assuming a unique constraint on (year, driver_id) exists in DB schema
        # If the schema doesn't supportupsert on conflict, we might need to delete/insert or similar.
        # We'll try standard upsert assuming conflict on (year, driver_id)
        supabase.table("season_entries").upsert(
            entries_to_upsert, 
            on_conflict="year, driver_id"
        ).execute()

    print("✅ Season synced successfully.")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python sync_season.py <year>")
        sys.exit(1)
    
    y = int(sys.argv[1])
    sync_season_data(y)
