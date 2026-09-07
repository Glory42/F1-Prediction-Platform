"""Covers sync_season.run: team-key normalisation, driver-code resolution and its
fallbacks, driver-number coercion, the team_id remap after the teams upsert, and the
two upsert calls' conflict keys. FastF1, the DB connection and upsert are mocked."""
from unittest.mock import MagicMock, patch

import pytest

from src.jobs import sync_season
from src.jobs.sync_season import run
from tests.support.fake_db import FakeConnection


def _info(*, team="Red Bull Racing", full="Max Verstappen", num="1", abbr="VER", country="NED"):
    return {
        "TeamName": team, "FullName": full, "DriverNumber": num,
        "Abbreviation": abbr, "CountryCode": country,
    }


def _session(infos):
    s = MagicMock()
    s.drivers = list(infos.keys())
    s.get_driver.side_effect = lambda n: infos[n]
    return s


def _run(infos, *, season_row={"id": 1}, team_map_rows=None):
    if team_map_rows is None:
        # Default: echo back whatever team_keys the infos imply, ids 100+.
        keys = []
        for info in infos.values():
            k = str(info["TeamName"]).lower().replace(" ", "_").replace("-", "_").replace(".", "")
            if k not in keys:
                keys.append(k)
        team_map_rows = [{"id": 100 + i, "team_key": k} for i, k in enumerate(keys)]
    conn = FakeConnection([season_row, team_map_rows])
    with patch.object(sync_season.fastf1, "get_session", return_value=_session(infos)), \
         patch.object(sync_season, "get_conn", return_value=conn), \
         patch.object(sync_season, "upsert") as mock_upsert:
        run(2025, 1)
    return conn, mock_upsert


def test_missing_season_raises():
    with pytest.raises(ValueError, match="Season 2025 not found"):
        _run({"1": _info()}, season_row=None)


def test_upserts_teams_then_drivers_with_their_conflict_keys():
    _, mock_upsert = _run({
        "1": _info(team="Red Bull Racing", full="Max Verstappen", num="1", abbr="VER"),
        "16": _info(team="Ferrari", full="Charles Leclerc", num="16", abbr="LEC"),
    })
    teams_call, drivers_call = mock_upsert.call_args_list
    assert teams_call.args[1] == "teams"
    assert teams_call.args[3] == ["season_id", "team_key"]
    assert {t["team_key"] for t in teams_call.args[2]} == {"red_bull_racing", "ferrari"}

    assert drivers_call.args[1] == "drivers"
    assert drivers_call.args[3] == ["season_id", "driver_number"]
    codes = {d["code"] for d in drivers_call.args[2]}
    assert codes == {"VER", "LEC"}


def test_team_key_normalises_spaces_hyphens_and_dots():
    _, mock_upsert = _run({"1": _info(team="Racing-Bulls F1.Team")})
    assert mock_upsert.call_args_list[0].args[2][0]["team_key"] == "racing_bulls_f1team"


def test_driver_code_falls_back_to_last_name_when_abbreviation_blank():
    _, mock_upsert = _run({"1": _info(full="Max Verstappen", abbr="")})
    assert mock_upsert.call_args_list[1].args[2][0]["code"] == "VER"


def test_short_fallback_code_is_padded_with_driver_number():
    _, mock_upsert = _run({"1": _info(full="Guanyu Li", num="44", abbr="")})
    assert mock_upsert.call_args_list[1].args[2][0]["code"] == "LI4"


def test_non_numeric_driver_number_coerces_to_zero():
    _, mock_upsert = _run({"1": _info(num="TBD", abbr="XYZ")})
    assert mock_upsert.call_args_list[1].args[2][0]["driver_number"] == 0


def test_single_word_full_name_leaves_last_name_empty():
    _, mock_upsert = _run({"1": _info(full="Rindt", abbr="RIN")})
    row = mock_upsert.call_args_list[1].args[2][0]
    assert (row["first_name"], row["last_name"]) == ("Rindt", "")


def test_empty_country_code_becomes_none():
    _, mock_upsert = _run({"1": _info(country="")})
    assert mock_upsert.call_args_list[1].args[2][0]["nationality"] is None


def test_driver_skipped_when_team_missing_from_remap():
    _, mock_upsert = _run({"1": _info()}, team_map_rows=[])
    # Only the teams upsert runs — drivers_to_upsert is empty.
    assert len(mock_upsert.call_args_list) == 1
    assert mock_upsert.call_args_list[0].args[1] == "teams"
