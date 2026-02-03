import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.supabase_client import supabase

def verify_data():
    years = [2016, 2020, 2024]
    
    for year in years:
        races = supabase.table("races").select("id", count="exact").eq("year", year).execute()
        count = races.count
        print(f"Year {year}: {count} races found.")
        
        if count > 0:
            # Check predictions
            preds = supabase.table("predictions").select("race_id", count="exact").execute()
            # This counts all predictions, let's filter by races of that year
            # We need to join, but supabase-py select filters are limited on joins for counting directly sometimes
            # Let's just grab the races and check predictions for the first one
            
            first_race = supabase.table("races").select("id").eq("year", year).limit(1).single().execute()
            if first_race.data:
                rid = first_race.data['id']
                pred = supabase.table("predictions").select("*").eq("race_id", rid).execute()
                print(f"  Sample Race ({rid}): Prediction exists? {bool(pred.data)}")
                if pred.data:
                    print(f"  Prediction Data: {pred.data[0]}")

if __name__ == "__main__":
    verify_data()
