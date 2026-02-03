import sys
import os
import fastf1
import pandas as pd
import random
from datetime import datetime

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.supabase_client import supabase
from scripts.sync_races import sync_races
from scripts.sync_season import sync_season_data
from scripts.ingest_race_data import ingest_race_data

def get_actual_winner(year, round_num):
    print(f"   Fetching actual winner for {year} Round {round_num}...")
    try:
        session = fastf1.get_session(year, round_num, 'R')
        session.load(laps=False, telemetry=False, weather=False, messages=False)
        if hasattr(session, 'results') and not session.results.empty:
            winner = session.results.iloc[0]
            return str(winner['Abbreviation']).lower()
    except Exception as e:
        print(f"   ⚠️ Could not fetch winner: {e}")
    return None

def calculate_prediction_local(race_id):
    # Fetch race_data with season_entries to get driver_id
    resp = supabase.table("race_data") \
        .select("grid_position, fp2_avg_lap_time_ms, historical_track_rank, season_entries(drivers(id))") \
        .eq("race_id", race_id).execute()
    
    stats = resp.data
    if not stats:
        print("   ⚠️ No stats found for prediction.")
        return None, None

    # Calculate Pace Rank
    # Filter valid times
    valid_pace = [s for s in stats if s['fp2_avg_lap_time_ms'] is not None]
    valid_pace.sort(key=lambda x: x['fp2_avg_lap_time_ms'])
    
    pace_rank_map = {} # driver_id -> rank
    for idx, s in enumerate(valid_pace):
        did = s['season_entries']['drivers']['id']
        pace_rank_map[did] = idx + 1

    scores = []
    for row in stats:
        did = row['season_entries']['drivers']['id']
        
        grid = row['grid_position'] if row['grid_position'] else 20
        hist = row['historical_track_rank'] if row['historical_track_rank'] else 20
        pace = pace_rank_map.get(did, 20)
        
        # Formula: Grid*0.5 + Pace*0.3 + Hist*0.2
        score = (grid * 0.5) + (pace * 0.3) + (hist * 0.2)
        scores.append({'id': did, 'score': score})
    
    scores.sort(key=lambda x: x['score'])
    winner = scores[0]
    runner_up = scores[1] if len(scores) > 1 else None
    
    # Confidence
    confidence = 1.0
    if runner_up:
        gap = runner_up['score'] - winner['score']
        confidence = min(0.99, 0.5 + (gap / 10))
        
    return winner['id'], confidence

def backfill_year(year):
    print(f"\n=== BACKFILLING {year} ===")
    
    # 1. Sync Schedule
    sync_races(year)
    
    # 2. Sync Drivers/Teams
    sync_season_data(year)
    
    # 3. Process Races
    races_resp = supabase.table("races").select("*").eq("year", year).order("round").execute()
    races = races_resp.data
    
    now = datetime.now()
    
    for race in races:
        # Check if race is in the past
        race_date = datetime.fromisoformat(race['race_date'].replace('Z', '+00:00'))
        if race_date.timestamp() > now.timestamp():
            print(f"Skipping future race: {race['race_name']}")
            continue
            
        print(f"Processing Round {race['round']}: {race['race_name']}")
        
        # Ingest Data (Grid, Pace, Hist)
        ingest_race_data(race['id'])
        
        # Calculate Prediction
        pred_driver, conf = calculate_prediction_local(race['id'])
        
        # Fetch Actual Winner
        actual_driver = get_actual_winner(year, race['round'])
        
        if pred_driver:
            # Upsert Prediction
            data = {
                "race_id": race['id'],
                "predicted_winner_id": pred_driver,
                "confidence_score": conf,
                "actual_winner_id": actual_driver,
                "updated_at": datetime.now().isoformat()
            }
            # Add was_correct - Removing because it's a generated column in DB
            # if actual_driver:
            #     data["was_correct"] = (pred_driver == actual_driver)
                
            # Upsert
            # Check exist
            chk = supabase.table("predictions").select("race_id").eq("race_id", race['id']).execute()
            if chk.data:
                supabase.table("predictions").update(data).eq("race_id", race['id']).execute()
            else:
                supabase.table("predictions").insert(data).execute()
            
            print(f"   ✅ Saved: Pred={pred_driver}, Actual={actual_driver}")

if __name__ == "__main__":
    # Default to 2024-2025 if no args, or use args
    start_year = 2024
    end_year = 2025
    
    if len(sys.argv) >= 2:
        start_year = int(sys.argv[1])
        if len(sys.argv) >= 3:
            end_year = int(sys.argv[2])
        else:
            end_year = start_year

    for y in range(start_year, end_year + 1):
        backfill_year(y)
