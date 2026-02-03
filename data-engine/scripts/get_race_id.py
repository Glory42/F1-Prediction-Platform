import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.supabase_client import supabase

def get_race_id():
    # Get first race of 2024
    resp = supabase.table("races").select("id, race_name").eq("year", 2024).limit(1).execute()
    print(resp.data)

if __name__ == "__main__":
    get_race_id()
