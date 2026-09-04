import os

# src.config reads DATABASE_URL at import time; tests never call get_conn(), so a
# placeholder satisfies the import chain with or without a local .env.
os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")
