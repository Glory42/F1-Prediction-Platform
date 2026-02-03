import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.supabase_client import supabase

def check_tables():
    # Try to select from race_driver_stats
    try:
        resp = supabase.table("race_driver_stats").select("*").limit(1).execute()
        print("race_driver_stats exists:", resp.data)
    except Exception as e:
        print("race_driver_stats error:", e)

    # Try to select from race_data
    try:
        resp = supabase.table("race_data").select("*").limit(1).execute()
        print("race_data exists:", resp.data)
    except Exception as e:
        print("race_data error:", e)

if __name__ == "__main__":
    check_tables()
