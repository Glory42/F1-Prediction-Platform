from datetime import date, datetime
from typing import Any

import requests

BASE_URL = "https://api.openf1.org/v1"
_TIMEOUT_S = 10
_MAX_DATE_DRIFT_DAYS = 1  # covers night races (e.g. Las Vegas) crossing into the next UTC day


def _get(path: str, params: dict[str, Any]) -> Any:
    """OpenF1 returns 404 {"detail": "No results found."} — not 200 + [] — for any query
    that matches zero rows, on every endpoint we use. Treat that as an empty list rather
    than an error; every caller here expects a list back regardless."""
    resp = requests.get(f"{BASE_URL}/{path}", params=params, timeout=_TIMEOUT_S)
    if resp.status_code == 404:
        return []
    resp.raise_for_status()
    return resp.json()


def get_session_key(year: int, session_date: Any, session_name: str = "Race") -> int:
    """OpenF1's circuit naming doesn't line up 1:1 with our circuit_key values, so matching
    the session by closest start date is the reliable join key instead. session_name is
    "Race" for the Sunday GP or "Sprint" for the Saturday sprint session — both are covered
    by OpenF1 (2023+ only)."""
    sessions = _get("sessions", {"year": year, "session_name": session_name})
    if not sessions:
        # OpenF1 has no coverage before 2023, hence the empty list from _get above.
        raise ValueError(f"OpenF1 has no session data for year={year} session={session_name}")

    if isinstance(session_date, datetime):
        target = session_date.date()
    elif isinstance(session_date, date):
        target = session_date
    else:
        target = datetime.strptime(str(session_date), "%Y-%m-%d").date()

    closest = min(sessions, key=lambda s: abs((datetime.fromisoformat(s["date_start"]).date() - target).days))
    drift = abs((datetime.fromisoformat(closest["date_start"]).date() - target).days)
    if drift > _MAX_DATE_DRIFT_DAYS:
        raise ValueError(f"No OpenF1 {session_name} session found for year={year} date={target}")
    return closest["session_key"]


def fetch_race_control(session_key: int) -> list[dict]:
    return _get("race_control", {"session_key": session_key})


def fetch_overtakes(session_key: int) -> list[dict]:
    return _get("overtakes", {"session_key": session_key})


def fetch_team_radio(session_key: int) -> list[dict]:
    return _get("team_radio", {"session_key": session_key})
