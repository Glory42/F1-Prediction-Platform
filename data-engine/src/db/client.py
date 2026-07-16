from typing import Any
import psycopg2
import psycopg2.extras
import psycopg2.pool
from src.config import DATABASE_URL

_pool: psycopg2.pool.SimpleConnectionPool | None = None


def _get_pool() -> psycopg2.pool.SimpleConnectionPool:
    global _pool
    if _pool is None:
        _pool = psycopg2.pool.SimpleConnectionPool(
            1, 5, DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor
        )
    return _pool


class _PooledConnection:
    """Wraps a pooled connection so conn.close() returns it to the pool
    instead of tearing down the TCP/TLS session — every job already calls
    conn.close() in a finally block."""

    def __init__(self, pool: psycopg2.pool.SimpleConnectionPool, conn: Any) -> None:
        self._pool = pool
        self._conn = conn

    def close(self) -> None:
        self._pool.putconn(self._conn)

    def __getattr__(self, name: str) -> Any:
        return getattr(self._conn, name)


def get_conn() -> Any:
    pool = _get_pool()
    return _PooledConnection(pool, pool.getconn())
