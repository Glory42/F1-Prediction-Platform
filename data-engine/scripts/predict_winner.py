import fastf1
import random
import sys
import os

# Add parent directory to path to allow importing utils if run directly
if __name__ == "__main__":
    sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.supabase_client import supabase

def sync_current_drivers(year: int):
    # Load any session from the year to get the driver list
    session = fastf1.get_session(year, 1, 'R')
    session.load(laps=False, telemetry=False, weather=False, messages=False)
    
    drivers_data = []
    for drv in session.drivers:
        info = session.get_driver(drv)
        # Debug keys if needed
        # print(info.keys())
        drivers_data.append({
            "id": str(info['Abbreviation']).lower(),
            "number": int(info['DriverNumber']), # Changed from Number to DriverNumber potentially?
            "full_name": info['FullName'],
            "team_name": info['TeamName'],
            "team_colour": f"#{info['TeamColor']}"
        })

    # Bulk upsert to Supabase
    result = supabase.table("drivers").upsert(drivers_data).execute()
    print(f"✅ Synced {len(drivers_data)} drivers for {year}")

def calculate_prediction(year: int, round_num: int):
    """
    Mock prediction logic. 
    In a real scenario, this would load a model and features.
    Here we pick a top team driver randomly to simulate a 'prediction'.
    """
    print(f"🤖 analyzing telemetry for {year} round {round_num}...")
    
    # Fetch drivers from DB to ensure valid FK
    response = supabase.table("drivers").select("id").execute()
    drivers = response.data
    
    if not drivers:
        # Fallback if DB empty
        print("⚠️ No drivers found in DB, please run sync_current_drivers first.")
        return {"driver": "ver"} # Default fallback

    # Simple logic: pick a random driver
    chosen = random.choice(drivers)
    
    return {
        "driver": chosen['id'],
        "confidence": 0.85
    }

def sync_to_supabase(race_id: str, driver_id: str):
    """
    Upserts the prediction record for the race.
    """
    data = {
        "race_id": race_id,
        "predicted_winner_id": driver_id,
        # We can leave actual_winner_id null until the race is done
    }
    
    # Check if prediction exists to preserve ID or other fields if needed, 
    # but upsert on race_id constraint is usually best if schema allows.
    # Assuming race_id is unique for predictions or (race_id) is a unique constraint.
    
    # We first try to select to see if it exists to get the ID, or just upsert based on race_id match
    # If the schema has a unique constraint on race_id, we can just upsert.
    # Let's try an upsert on race_id if possible, or select first.
    
    existing = supabase.table("predictions").select("race_id").eq("race_id", race_id).execute()
    
    if existing.data:
        # Update
        supabase.table("predictions").update({
            "predicted_winner_id": driver_id
        }).eq("race_id", race_id).execute()
    else:
        # Insert
        supabase.table("predictions").insert(data).execute()
    
    print(f"💾 Saved prediction for race {race_id}: {driver_id}")

if __name__ == "__main__":
    sync_current_drivers(2025)
