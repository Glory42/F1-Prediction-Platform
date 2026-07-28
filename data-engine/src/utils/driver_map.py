def build_driver_code_map(conn, season_id: int) -> dict[str, int]:
    with conn.cursor() as cur:
        cur.execute("SELECT id, code FROM drivers WHERE season_id = %s", (season_id,))
        return {row["code"]: row["id"] for row in cur.fetchall()}
