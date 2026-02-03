import os
from supabase import create_client, Client
from dotenv import load_dotenv

# Bun handles .env automatically, but for Python we use load_dotenv
load_dotenv()

url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_KEY")

if not url or not key:
    raise ValueError("❌ Missing SUPABASE_URL or SUPABASE_KEY in environment variables.")

supabase: Client = create_client(url, key)