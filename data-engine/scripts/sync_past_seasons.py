import fastf1
import pandas as pd
import random
import sys
import os
from datetime import datetime

# Add parent directory to path to allow importing utils
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.supabase_client import supabase

def sync_drivers(year: int):
    print(f"🏎️  Syncing drivers for {year}...")
    try:
        # Load race 1 to get drivers, if it fails try race 2
        try:
            session = fastf1.get_session(year, 1, 'R')
            session.load(laps=False, telemetry=False, weather=False, messages=False)
        except Exception:
            # Fallback for years where round 1 might be weird or cancelled (e.g. 2020 Australia)
            try:
                session = fastf1.get_session(year, 2, 'R')
                session.load(laps=False, telemetry=False, weather=False, messages=False)
            except Exception:
                print(f"⚠️ Could not load any session for drivers in {year}")
                return

        drivers_data = []
        for drv in session.drivers:
            info = session.get_driver(drv)
            # Handle potential missing keys or types
            driver_number = info.get('DriverNumber') or info.get('Number')
            
            drivers_data.append({
                "id": str(info['Abbreviation']).lower(),
                "number": int(driver_number) if driver_number else None,
                "full_name": info['FullName'],
                "team_name": info['TeamName'],
                "team_colour": f"#{info['TeamColor']}" if info.get('TeamColor') else None
            })

        # Upsert drivers
        if drivers_data:
            supabase.table("drivers").upsert(drivers_data).execute()
    except Exception as e:
        print(f"⚠️ Failed to sync drivers for {year}: {e}")

def get_race_id(year, round_num):
    resp = supabase.table("races").select("id").eq("year", year).eq("round", round_num).single().execute()
    if resp.data:
        return resp.data['id']
    return None

def sync_season(year: int):
    print(f"\n📅 PROCESSING SEASON {year}...")
    
    # 1. Sync Drivers
    sync_drivers(year)

    # 2. Sync Schedule
    try:
        schedule = fastf1.get_event_schedule(year)
    except Exception as e:
        print(f"❌ Failed to get schedule for {year}: {e}")
        return

    races_data = []
    
    # Pre-process schedule to upsert races
    for i, row in schedule.iterrows():
        if row['RoundNumber'] == 0: continue
        
        race_date = row['EventDate']
        if isinstance(race_date, pd.Timestamp):
            race_date = race_date.isoformat()
            
        status = "completed" if row['EventDate'] < datetime.now() else "upcoming"
        
        races_data.append({
            "year": year,
            "round": int(row['RoundNumber']),
            "race_name": row['EventName'],
            "race_date": race_date,
            "status": status
        })

    if races_data:
        print(f"📝 Upserting {len(races_data)} races...")
        supabase.table("races").upsert(races_data, on_conflict="year, round").execute()

    # 3. Process Results for Completed Races
    # Fetch all drivers to pick random predictions from
    all_drivers_resp = supabase.table("drivers").select("id").execute()
    all_driver_ids = [d['id'] for d in all_drivers_resp.data] if all_drivers_resp.data else []

    for i, row in schedule.iterrows():
        round_num = int(row['RoundNumber'])
        if round_num == 0: continue
        
        # Only process if completed
        if row['EventDate'] >= datetime.now():
            continue

        print(f"   🏁 Processing Round {round_num}: {row['EventName']}")
        
        try:
            # Load Race Results
            session = fastf1.get_session(year, round_num, 'R')
            session.load(laps=False, telemetry=False, weather=False, messages=False)
            
            # Get Actual Winner
            if hasattr(session, 'results') and not session.results.empty:
                # Results are sorted by position usually, but let's be safe and sort
                sorted_results = session.results.sort_values(by=['Position'])
                winner_info = sorted_results.iloc[0]
                actual_winner_id = str(winner_info['Abbreviation']).lower()
            else:
                print("      ⚠️ No results found.")
                continue

            # Mock Prediction
            # 60% chance to predict the actual winner, otherwise random driver
            if random.random() < 0.6 and actual_winner_id in all_driver_ids:
                predicted_winner_id = actual_winner_id
            else:
                predicted_winner_id = random.choice(all_driver_ids) if all_driver_ids else actual_winner_id

            # Get Race ID from DB
            race_id = get_race_id(year, round_num)
            if not race_id:
                print("      ⚠️ Race ID not found in DB.")
                continue

            # Upsert Prediction
            pred_data = {
                "race_id": race_id,
                "predicted_winner_id": predicted_winner_id,
                "actual_winner_id": actual_winner_id
            }
            
            # Check if exists
            existing = supabase.table("predictions").select("race_id").eq("race_id", race_id).execute()
            if existing.data:
                supabase.table("predictions").update(pred_data).eq("race_id", race_id).execute()
            else:
                supabase.table("predictions").insert(pred_data).execute()
                
            print(f"      ✅ Winner: {actual_winner_id} | Pred: {predicted_winner_id}")

        except Exception as e:
            print(f"      ❌ Error processing results: {e}")

if __name__ == "__main__":
    # Sync from 2016 to 2025
    for y in range(2024, 2026):
        sync_season(y)
