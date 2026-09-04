from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Optional, cast

import pandas as pd

_CURRENT_RACE_GRACE = timedelta(days=2)
_LEAD = timedelta(hours=1)
_TAIL = timedelta(hours=24)
_SESSION_COLS = (
    "Session1DateUtc",
    "Session2DateUtc",
    "Session3DateUtc",
    "Session4DateUtc",
    "Session5DateUtc",
)


@dataclass(frozen=True)
class RaceWeekendWindow:
    round_number: int
    start: datetime
    end: datetime

    def contains(self, now: datetime) -> bool:
        return self.start <= now <= self.end


def _to_utc(value: Any) -> Optional[datetime]:
    """FastF1 session columns are tz-naive pandas Timestamps implicitly in UTC.
    None / NaN / NaT all collapse to pd.NaT through the Timestamp constructor."""
    ts = pd.Timestamp(value)
    if ts is pd.NaT:
        return None
    # ts is a real Timestamp past the guard; to_pydatetime()'s stub still unions in NaTType.
    return cast(datetime, ts.to_pydatetime()).replace(tzinfo=timezone.utc)


def race_weekend_window(schedule: pd.DataFrame, now: datetime) -> Optional[RaceWeekendWindow]:
    """Derived purely from the FastF1 schedule, no DB. A race stays "current" until
    _CURRENT_RACE_GRACE past its start so post-race ingestion still falls inside."""
    candidates = []
    for _, row in schedule.iterrows():
        race_start = _to_utc(row.get("Session5DateUtc"))
        if race_start is None or race_start < now - _CURRENT_RACE_GRACE:
            continue
        candidates.append((race_start, row))

    if not candidates:
        return None

    race_start, row = min(candidates, key=lambda pair: pair[0])
    session_times = [t for col in _SESSION_COLS if (t := _to_utc(row.get(col))) is not None]

    return RaceWeekendWindow(
        round_number=int(row["RoundNumber"]),
        start=min(session_times) - _LEAD,
        end=race_start + _TAIL,
    )
