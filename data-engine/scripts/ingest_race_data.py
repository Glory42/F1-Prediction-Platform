import fastf1
import sys
import os
import pandas as pd
from fastf1.ergast import Ergast

# Add parent directory to path to allow importing utils
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.supabase_client import supabase

def ingest_race_data(race_id: int):
    print(f"📥 Ingesting Race Data for Race ID: {race_id}")

    # 1. Fetch Race Details
    resp = supabase.table("races").select("*").eq("id", race_id).single().execute()
    if not resp.data:
        print(f"❌ Race {race_id} not found in DB.")
        return
    
    race = resp.data
    year = race['year']
    round_num = race['round']
    
    print(f"   Processing {year} Round {round_num}: {race['race_name']}")

    # 2. Fetch Season Entries for Mapping
    # entries_map: driver_id -> season_entry_id
    se_resp = supabase.table("season_entries").select("id, driver_id").eq("year", year).execute()
    if not se_resp.data:
        print(f"❌ No season entries found for {year}. Run sync_season.py first.")
        return
    
    entries_map = {item['driver_id']: item['id'] for item in se_resp.data}

    # 3. Fetch Qualifying Data (Grid Position)
    print("   Fetching Qualifying session...")
    quali = fastf1.get_session(year, round_num, 'Q')
    try:
        quali.load(laps=False, telemetry=False, weather=False, messages=False)
        quali_results = quali.results
    except Exception as e:
        print(f"   ⚠️ Failed to load Quali: {e}. Using empty grid data.")
        quali_results = pd.DataFrame()

    # 4. Fetch FP2 Data (Pace)
    # Check if Sprint weekend, might not have FP2 or it might be called something else.
    # But usually FP2 exists. Chinese GP 2024 was Sprint.
    # Sprint format: FP1 -> Sprint Quali -> Sprint -> Quali -> Race.
    # So "FP2" doesn't exist. We should use "SQ" or just skip Pace data for Sprint weekends.
    print("   Fetching FP2 session...")
    try:
        # Try getting FP2, if fails, it might be a Sprint weekend
        fp2 = fastf1.get_session(year, round_num, 'FP2')
        fp2.load(laps=True, telemetry=False, weather=False, messages=False)
        laps = fp2.laps.pick_accurate()
        if not laps.empty:
            avg_laps = laps.groupby('Driver')['LapTime'].mean()
        else:
            avg_laps = pd.Series()
    except Exception as e:
        print(f"   ⚠️ Failed to load FP2 (Sprint weekend?): {e}. Using empty pace data.")
        avg_laps = pd.Series()

    # 5. Fetch Historical Rank (Standings before this race)
    print("   Fetching Championship Standings...")
    ergast = Ergast()
    # To get standings *coming into* this race, we look at the previous round.
    # If round 1, we might use last year's or default to 0.
    target_round = round_num - 1
    rank_map = {}
    
    if target_round > 0:
        try:
            standings = ergast.get_driver_standings(season=year, round=target_round)
            # standings.content[0] usually contains the table
            if standings.content:
                for row in standings.content[0].iterrows():
                    d_data = row[1]
                    code = d_data['driverCode'].lower() if d_data['driverCode'] else None
                    if code:
                        rank_map[code] = int(d_data['position'])
        except Exception as e:
            print(f"   ⚠️ Failed to fetch standings: {e}")
    
    # 6. Build Payload
    race_data_payload = []
    
    # Iterate through all drivers found in entries_map (active this season)
    for driver_id, season_entry_id in entries_map.items():
        # Get driver Abbreviation for lookup in FastF1 results
        # Our DB ID is lower case abbreviation
        abbr = driver_id.upper() 
        
        # Quali Pos
        q_pos = None
        if not quali_results.empty:
            try:
                # Need to be careful with indexing. 
                # If Abbreviation is a column:
                d_res = quali_results[quali_results['Abbreviation'] == abbr]
                if not d_res.empty:
                    q_pos = int(d_res.iloc[0]['Position'])
            except:
                pass
        
        # FP2 Avg Pace
        fp2_ms = None
        if not avg_laps.empty and abbr in avg_laps:
             # Timedelta to ms
             val = avg_laps[abbr]
             if not pd.isna(val):
                 fp2_ms = int(val.total_seconds() * 1000)

        # Historical Rank
        # Default to 20 if not found (back of grid equivalent)
        h_rank = rank_map.get(driver_id, 20) 

        race_data_payload.append({
            "race_id": race_id,
            "season_entry_id": season_entry_id,
            "grid_position": q_pos,
            "fp2_avg_lap_time_ms": fp2_ms,
            "historical_track_rank": h_rank
        })

    # 7. Upsert to DB
    if race_data_payload:
        print(f"   💾 Upserting {len(race_data_payload)} race_data rows...")
        
        # Cleanup existing rows for this race first to avoid conflict issues if upsert keys aren't perfect
        supabase.table("race_data").delete().eq("race_id", race_id).execute()
        
        supabase.table("race_data").insert(race_data_payload).execute()

    print("✅ Race Data ingested successfully.")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python ingest_race_data.py <race_id>")
        sys.exit(1)
    
    rid = int(sys.argv[1])
    ingest_race_data(rid)
