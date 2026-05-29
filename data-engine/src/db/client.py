import psycopg2
import psycopg2.extras
from src.config import DATABASE_URL


def get_conn():
    return psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)
