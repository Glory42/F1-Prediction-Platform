import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.supabase_client import supabase

def delete_prediction(race_id):
    supabase.table("predictions").delete().eq("race_id", race_id).execute()
    print(f"Deleted prediction for race {race_id}")

if __name__ == "__main__":
    delete_prediction(147)
