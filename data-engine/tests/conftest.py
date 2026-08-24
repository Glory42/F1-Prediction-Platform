import os

# src.config reads DATABASE_URL at import time (module-level `os.environ["DATABASE_URL"]`).
# Tests only import job modules for their pure logic (WEIGHTS dicts, helper functions) and
# never call get_conn(), so a placeholder value is enough to satisfy the import chain in any
# environment, with or without a local .env.
os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")
