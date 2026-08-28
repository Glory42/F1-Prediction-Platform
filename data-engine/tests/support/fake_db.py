class FakeCursor:
    """Mimics psycopg2's RealDictCursor: dict-like rows, context-manager `with conn.cursor() as cur:`."""

    def __init__(self, rows):
        self._rows = rows
        self.executed: list[tuple] = []

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def execute(self, query, params=None):
        self.executed.append((query, params))

    def fetchone(self):
        return self._rows[0] if self._rows else None

    def fetchall(self):
        return list(self._rows)


class FakeConnection:
    """
    Scripted stand-in for a psycopg2 connection: each `with conn.cursor() as cur:`
    block in the job code issues exactly one query, so `queued_rows` supplies one
    result set per call, in call order.
    """

    def __init__(self, queued_rows: list[list[dict] | dict | None]):
        self._queue = list(queued_rows)
        self.cursors: list[FakeCursor] = []
        self.closed = False
        self.commits = 0

    def close(self):
        self.closed = True

    def commit(self):
        self.commits += 1

    def cursor(self):
        next_rows = self._queue.pop(0) if self._queue else []
        if next_rows is None:
            next_rows = []
        elif isinstance(next_rows, dict):
            next_rows = [next_rows]
        cur = FakeCursor(next_rows)
        self.cursors.append(cur)
        return cur
