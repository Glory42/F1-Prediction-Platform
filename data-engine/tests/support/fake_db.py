class FakeCursor:
    """Mimics psycopg2's RealDictCursor: dict-like rows, context-manager `with conn.cursor() as cur:`."""

    def __init__(self, conn, initial_rows):
        self._conn = conn
        self._rows = initial_rows
        self.executed: list[tuple] = []
        self._first_exec = True

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def execute(self, query, params=None):
        self.executed.append((query, params))
        if not self._first_exec and self._conn and self._conn._queue:
            next_rows = self._conn._queue.pop(0)
            if next_rows is None:
                self._rows = []
            elif isinstance(next_rows, dict):
                self._rows = [next_rows]
            else:
                self._rows = list(next_rows)
        self._first_exec = False

    def fetchone(self):
        return self._rows[0] if self._rows else None

    def fetchall(self):
        return list(self._rows)


class FakeConnection:
    """
    Scripted stand-in for a psycopg2 connection: each query executed against
    a cursor pulls one result set from `queued_rows` in call order.
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
        cur = FakeCursor(self, next_rows)
        self.cursors.append(cur)
        return cur

