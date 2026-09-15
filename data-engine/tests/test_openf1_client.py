from datetime import datetime, timezone

import pytest
import requests

import src.utils.openf1_client as openf1_client
from src.utils.openf1_client import fetch_overtakes, fetch_race_control, fetch_team_radio, get_session_key


class _FakeResponse:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.exceptions.HTTPError(f"{self.status_code} error")

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
        # OpenF1 has no data before 2023 — confirmed live to return 404 (not 200 + []) for
        # any query matching zero rows, on every endpoint, not just this pre-coverage case.
        monkeypatch.setattr(
            openf1_client.requests, "get",
            lambda *a, **k: _FakeResponse({"detail": "No results found."}, status_code=404)
        )

        with pytest.raises(ValueError, match="no session data"):
            get_session_key(2021, "2021-03-28")

    def test_accepts_a_full_datetime_for_a_timestamptz_column_like_sprint_date(self, monkeypatch):
        # races.sprint_date is a TIMESTAMPTZ, so psycopg2 hands back a datetime (not a
        # bare date like races.race_date) — must reduce to a date before comparing.
        sessions = [{"session_key": 9591, "date_start": "2024-08-31T15:00:00+00:00"}]
        monkeypatch.setattr(openf1_client.requests, "get", lambda *a, **k: _FakeResponse(sessions))

        target = datetime(2024, 8, 31, 15, 0, tzinfo=timezone.utc)
        assert get_session_key(2024, target, session_name="Sprint") == 9591

    def test_session_name_is_forwarded_to_the_sessions_query(self, monkeypatch):
        captured = {}

        def fake_get(url, params, timeout):
            captured["params"] = params
            return _FakeResponse([{"session_key": 1, "date_start": "2024-09-01T13:00:00+00:00"}])

        monkeypatch.setattr(openf1_client.requests, "get", fake_get)

        get_session_key(2024, "2024-09-01", session_name="Sprint")

        assert captured["params"]["session_name"] == "Sprint"

    def test_no_matching_sprint_session_error_names_the_session(self, monkeypatch):
        sessions = [{"session_key": 9515, "date_start": "2024-05-19T13:00:00+00:00"}]
        monkeypatch.setattr(openf1_client.requests, "get", lambda *a, **k: _FakeResponse(sessions))

        with pytest.raises(ValueError, match="No OpenF1 Sprint session found"):
            get_session_key(2024, "2024-09-01", session_name="Sprint")


class TestFetchRaceControl:
    def test_returns_parsed_json(self, monkeypatch):
        messages = [{"category": "Flag", "message": "GREEN LIGHT - PIT EXIT OPEN"}]
        monkeypatch.setattr(openf1_client.requests, "get", lambda *a, **k: _FakeResponse(messages))

        assert fetch_race_control(9636) == messages

    def test_returns_empty_list_on_404(self, monkeypatch):
        monkeypatch.setattr(
            openf1_client.requests, "get",
            lambda *a, **k: _FakeResponse({"detail": "No results found."}, status_code=404)
        )

        assert fetch_race_control(9636) == []


class TestFetchOvertakes:
    def test_returns_parsed_json(self, monkeypatch):
        overtakes = [{"overtaking_driver_number": 63, "overtaken_driver_number": 4, "position": 1}]
        monkeypatch.setattr(openf1_client.requests, "get", lambda *a, **k: _FakeResponse(overtakes))

        assert fetch_overtakes(9636) == overtakes

    def test_returns_empty_list_on_404(self, monkeypatch):
        monkeypatch.setattr(
            openf1_client.requests, "get",
            lambda *a, **k: _FakeResponse({"detail": "No results found."}, status_code=404)
        )

        assert fetch_overtakes(9636) == []


class TestFetchTeamRadio:
    def test_returns_parsed_json(self, monkeypatch):
        clips = [{"driver_number": 4, "recording_url": "https://example.com/clip.mp3"}]
        monkeypatch.setattr(openf1_client.requests, "get", lambda *a, **k: _FakeResponse(clips))

        assert fetch_team_radio(9636) == clips

    def test_returns_empty_list_on_404(self, monkeypatch):
        # The real bug this guards against: a session with zero radio clips (common — F1
        # doesn't release radio for every session) 404s instead of returning 200 + [].
        monkeypatch.setattr(
            openf1_client.requests, "get",
            lambda *a, **k: _FakeResponse({"detail": "No results found."}, status_code=404)
        )

        assert fetch_team_radio(9636) == []
