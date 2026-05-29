from typing import Any


def upsert(conn, table: str, rows: list[dict[str, Any]], conflict_cols: list[str]) -> None:
    if not rows:
        return

    cols = list(rows[0].keys())
    col_list = ", ".join(cols)
    placeholders = ", ".join(["%s"] * len(cols))
    update_set = ", ".join(
        f"{c} = EXCLUDED.{c}" for c in cols if c not in conflict_cols
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
