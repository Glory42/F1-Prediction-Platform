import pytest

import src.utils.openf1_client as openf1_client
from src.utils.openf1_client import fetch_overtakes, fetch_race_control, fetch_team_radio, get_session_key


class _FakeResponse:
    def __init__(self, payload):
        self._payload = payload
        self.raised = False

    def raise_for_status(self):
        self.raised = False

    def json(self):
        return self._payload


class TestGetSessionKey:
    def test_matches_session_by_race_date(self, monkeypatch):
        sessions = [
            {"session_key": 9515, "date_start": "2024-05-19T13:00:00+00:00"},
            {"session_key": 9590, "date_start": "2024-09-01T13:00:00+00:00"},
        ]
        monkeypatch.setattr(openf1_client.requests, "get", lambda *a, **k: _FakeResponse(sessions))

        assert get_session_key(2024, "2024-09-01") == 9590

    def test_matches_across_a_one_day_utc_drift(self, monkeypatch):
        # Las Vegas races at night local time, so OpenF1's UTC date_start lands one
        # calendar day after our (local-date) race_date.
        sessions = [{"session_key": 9189, "date_start": "2023-11-19T06:00:00+00:00"}]
        monkeypatch.setattr(openf1_client.requests, "get", lambda *a, **k: _FakeResponse(sessions))

        assert get_session_key(2023, "2023-11-18") == 9189

    def test_no_matching_session_raises(self, monkeypatch):
        sessions = [{"session_key": 9515, "date_start": "2024-05-19T13:00:00+00:00"}]
        monkeypatch.setattr(openf1_client.requests, "get", lambda *a, **k: _FakeResponse(sessions))

        with pytest.raises(ValueError, match="No OpenF1 Race session found"):
            get_session_key(2024, "2024-09-01")

    def test_pre_coverage_year_raises_clean_error(self, monkeypatch):
        # OpenF1 has no data before 2023 and returns a dict, not a list, for those years.
        monkeypatch.setattr(
            openf1_client.requests, "get",
            lambda *a, **k: _FakeResponse({"detail": "No results found."})
        )

        with pytest.raises(ValueError, match="no session data"):
            get_session_key(2021, "2021-03-28")


class TestFetchRaceControl:
    def test_returns_parsed_json(self, monkeypatch):
        messages = [{"category": "Flag", "message": "GREEN LIGHT - PIT EXIT OPEN"}]
        monkeypatch.setattr(openf1_client.requests, "get", lambda *a, **k: _FakeResponse(messages))

        assert fetch_race_control(9636) == messages


class TestFetchOvertakes:
    def test_returns_parsed_json(self, monkeypatch):
        overtakes = [{"overtaking_driver_number": 63, "overtaken_driver_number": 4, "position": 1}]
        monkeypatch.setattr(openf1_client.requests, "get", lambda *a, **k: _FakeResponse(overtakes))

        assert fetch_overtakes(9636) == overtakes


class TestFetchTeamRadio:
    def test_returns_parsed_json(self, monkeypatch):
        clips = [{"driver_number": 4, "recording_url": "https://example.com/clip.mp3"}]
        monkeypatch.setattr(openf1_client.requests, "get", lambda *a, **k: _FakeResponse(clips))

        assert fetch_team_radio(9636) == clips
