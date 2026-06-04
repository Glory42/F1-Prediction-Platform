from typing import Any


def upsert(
    conn,
    table: str,
    rows: list[dict[str, Any]],
    conflict_cols: list[str],
    exclude_update: list[str] | None = None,
) -> None:
    """
    Upsert rows into table.
    conflict_cols  — columns that form the unique key (skipped in UPDATE SET).
    exclude_update — additional columns to skip in UPDATE SET (e.g. 'status'
                     so existing completed rows aren't reset to 'scheduled').
    """
    if not rows:
        return

    skip_on_update = set(conflict_cols) | set(exclude_update or [])
    cols = list(rows[0].keys())
    col_list = ", ".join(cols)
    placeholders = ", ".join(["%s"] * len(cols))
    update_set = ", ".join(
        f"{c} = EXCLUDED.{c}" for c in cols if c not in skip_on_update
    )
    conflict = ", ".join(conflict_cols)

    query = f"""
        INSERT INTO {table} ({col_list})
        VALUES ({placeholders})
        ON CONFLICT ({conflict}) DO UPDATE SET {update_set}
    """

    with conn.cursor() as cur:
        for row in rows:
            cur.execute(query, [row[c] for c in cols])
    conn.commit()
