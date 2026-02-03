import sys
import os

# Add scripts to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from utils.supabase_client import supabase
from scripts.sync_races import sync_races
from scripts.sync_season import sync_season_data
from scripts.ingest_race_data import ingest_race_data
# We'll use the local calculator from backfill for now, or assume backend handles it.
# The user wants "start script for data-engine"
# This script should ingest data and then trigger prediction.
# Triggering prediction via backend API is cleaner but requires running backend.
# Calculating locally is faster.
from scripts.backfill_full import calculate_prediction_local

def run_engine(year, round_num):
    print(f"🚀 Starting F1 Data Engine for {year} Round {round_num}")
    
    # 1. Sync Season (Ensure drivers/teams exist)
    # This is fast if already synced
    sync_season_data(year)
    
    # 2. Get Race ID
    race_query = supabase.table("races") \
        .select("id, status, race_name") \
        .eq("year", year) \
        .eq("round", round_num) \
        .single().execute()
    
    race = race_query.data
    if not race:
        print(f"❌ Race not found in DB. Syncing schedule...")
        sync_races(year)
        # Retry
        race_query = supabase.table("races") \
            .select("id, status, race_name") \
            .eq("year", year) \
            .eq("round", round_num) \
            .single().execute()
        race = race_query.data
        if not race:
            print("❌ Race still not found. Aborting.")
            return

    print(f"   Target: {race['race_name']} (ID: {race['id']})")

    # 3. Ingest Data
    ingest_race_data(race['id'])

    # 4. Generate Prediction
    print("   🔮 Generating prediction...")
    pred_driver, conf = calculate_prediction_local(race['id'])
    
    if pred_driver:
        # Upsert Prediction
        data = {
            "race_id": race['id'],
            "predicted_winner_id": pred_driver,
            "confidence_score": conf,
            "updated_at": "now()"
        }
        
        # Check exist
        chk = supabase.table("predictions").select("race_id").eq("race_id", race['id']).execute()
        if chk.data:
            supabase.table("predictions").update(data).eq("race_id", race['id']).execute()
        else:
            supabase.table("predictions").insert(data).execute()
        
        print(f"   ✅ Prediction Saved: {pred_driver} ({conf:.2f})")
    else:
        print("   ⚠️ Could not generate prediction (insufficient data?)")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python main.py <year> <round>")
        sys.exit(1)
        
    y = int(sys.argv[1])
    r = int(sys.argv[2])
    run_engine(y, r)