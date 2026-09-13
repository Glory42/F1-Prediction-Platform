from datetime import date, datetime
from typing import Any

import requests

BASE_URL = "https://api.openf1.org/v1"
_TIMEOUT_S = 10
_MAX_DATE_DRIFT_DAYS = 1  # covers night races (e.g. Las Vegas) crossing into the next UTC day


def get_session_key(year: int, race_date: Any) -> int:
    """OpenF1's circuit naming doesn't line up 1:1 with our circuit_key values, so matching
    the Race session by closest start date is the reliable join key instead."""
    resp = requests.get(
        f"{BASE_URL}/sessions", params={"year": year, "session_name": "Race"}, timeout=_TIMEOUT_S
    )
    resp.raise_for_status()
    sessions = resp.json()
    if not isinstance(sessions, list) or not sessions:
        # OpenF1 has no coverage before 2023 and returns {"detail": "No results found."}
        # (not an empty list) for those years.
        raise ValueError(f"OpenF1 has no session data for year={year} (response: {sessions})")

    target = race_date if isinstance(race_date, date) else datetime.strptime(str(race_date), "%Y-%m-%d").date()
    closest = min(sessions, key=lambda s: abs((datetime.fromisoformat(s["date_start"]).date() - target).days))
    drift = abs((datetime.fromisoformat(closest["date_start"]).date() - target).days)
    if drift > _MAX_DATE_DRIFT_DAYS:
        raise ValueError(f"No OpenF1 Race session found for year={year} race_date={target}")
    return closest["session_key"]


def fetch_race_control(session_key: int) -> list[dict]:
    resp = requests.get(
        f"{BASE_URL}/race_control", params={"session_key": session_key}, timeout=_TIMEOUT_S
    )
    resp.raise_for_status()
    return resp.json()


def fetch_overtakes(session_key: int) -> list[dict]:
    resp = requests.get(
        f"{BASE_URL}/overtakes", params={"session_key": session_key}, timeout=_TIMEOUT_S
    )
    resp.raise_for_status()
    return resp.json()


def fetch_team_radio(session_key: int) -> list[dict]:
    resp = requests.get(
        f"{BASE_URL}/team_radio", params={"session_key": session_key}, timeout=_TIMEOUT_S
    )
    resp.raise_for_status()
    return resp.json()
