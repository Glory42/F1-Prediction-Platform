from typing import Any

import requests

BASE_URL = "https://api.openf1.org/v1"
_TIMEOUT_S = 10


def get_session_key(year: int, race_date: Any) -> int:
    """OpenF1's circuit naming doesn't line up 1:1 with our circuit_key values, so matching
    the Race session by start date is the reliable join key instead."""
    resp = requests.get(
        f"{BASE_URL}/sessions", params={"year": year, "session_name": "Race"}, timeout=_TIMEOUT_S
    )
    resp.raise_for_status()
    race_date_str = str(race_date)
    sessions = resp.json()
    if not isinstance(sessions, list):
        # OpenF1 has no coverage before 2023 and returns {"detail": "No results found."}
        # (not an empty list) for those years.
        raise ValueError(f"OpenF1 has no session data for year={year} (response: {sessions})")
    for session in sessions:
        if session["date_start"].startswith(race_date_str):
            return session["session_key"]
    raise ValueError(f"No OpenF1 Race session found for year={year} race_date={race_date_str}")


def fetch_race_control(session_key: int) -> list[dict]:
    resp = requests.get(
        f"{BASE_URL}/race_control", params={"session_key": session_key}, timeout=_TIMEOUT_S
    )
    resp.raise_for_status()
    return resp.json()
