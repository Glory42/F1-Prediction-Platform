import fastf1
import pandas as pd
import sys
import os

# Add parent directory to path to allow importing utils
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.supabase_client import supabase
from datetime import datetime

def sync_races(year: int):
    print(f"📅 Fetching race schedule for {year}...")
    schedule = fastf1.get_event_schedule(year)
    
    races_data = []
    
    for i, row in schedule.iterrows():
        # FastF1 returns pre-season testing as well, we usually only want races
        # The 'EventFormat' or 'Session5' (Race) existence can indicate a race.
        # Or check if 'RoundNumber' > 0.
        
        if row['RoundNumber'] == 0:
            continue

        # Construct a unique ID or let DB handle it?
        # Ideally we want a stable ID. specific to year-round.
        # But if the DB has uuid pk, we rely on upsert via year+round unique constraint?
        # Let's check if we can form data.
        
        # Date handling
        race_date = row['EventDate']
        # Convert to ISO format string if it's a timestamp
        if isinstance(race_date, pd.Timestamp):
            race_date = race_date.isoformat()

        # Determine status
        now = datetime.now()
        status = "upcoming"
        if row['EventDate'] < now:
            status = "completed"
        
        races_data.append({
            "year": year,
            "round": int(row['RoundNumber']),
            "race_name": row['EventName'],
            "race_date": race_date,
            "status": status
        })

    if not races_data:
        print("No races found.")
        return

    # Upsert based on year+round composite key if possible.
    # If the table doesn't have a unique constraint on (year, round), we might duplicate.
    # Ideally we should select first or assume there is a constraint.
    # We will try upsert.
    
    try:
        # Assuming there is a unique constraint on (year, round) or we just insert.
        # If there is no unique constraint, this will duplicate rows.
        # Let's try to check if they exist first to be safe, or just use upsert and hope for unique constraint.
        # Given the error in main.py was "0 rows", the table is likely empty.
        
        print(f"Insert/Update {len(races_data)} races...")
        
        # We need to handle the response.
        data = supabase.table("races").upsert(races_data, on_conflict="year, round").execute()
        print("✅ Races synced successfully.")
        
    except Exception as e:
        print(f"Error syncing races: {e}")

if __name__ == "__main__":
    sync_races(2026)
