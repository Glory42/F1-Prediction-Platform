import os
from dotenv import load_dotenv
import fastf1

load_dotenv()

DATABASE_URL: str = os.environ["DATABASE_URL"]

FASTF1_CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", "cache")
os.makedirs(FASTF1_CACHE_DIR, exist_ok=True)
fastf1.Cache.enable_cache(FASTF1_CACHE_DIR)
