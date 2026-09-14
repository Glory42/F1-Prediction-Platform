import src.jobs.ingest_team_radio as ingest_team_radio
from src.jobs.ingest_team_radio import _to_rows, run
from src.utils.openf1_client import fetch_team_radio


class TestToRows:
    def test_maps_a_clip_to_a_row(self):
        clips = [{
            "date": "2024-11-03T14:45:52+00:00", "driver_number": 4,
            "recording_url": "https://livetiming.formula1.com/static/clip.mp3",
        }]

        rows, skipped = _to_rows(clips, race_id=1, driver_map={4: 100})

        assert skipped == 0
        assert rows == [{
            "race_id": 1, "driver_id": 100, "date": "2024-11-03T14:45:52+00:00",
            "recording_url": "https://livetiming.formula1.com/static/clip.mp3",
        }]

    def test_skips_clips_with_unknown_driver_number(self):
        clips = [{"date": "d", "driver_number": 99, "recording_url": "u"}]

        rows, skipped = _to_rows(clips, race_id=1, driver_map={4: 100})

        assert rows == []
        assert skipped == 1

    def test_empty_input_returns_empty(self):
        assert _to_rows([], race_id=1, driver_map={}) == ([], 0)


class TestRun:
    def test_wires_the_expected_config(self, monkeypatch):
        captured = {}
        monkeypatch.setattr(
            ingest_team_radio, "run_openf1_job",
            lambda year, round_num, config: captured.update(year=year, round_num=round_num, config=config)
        )

        run(2024, 20)

        assert captured["year"] == 2024
        assert captured["round_num"] == 20
        config = captured["config"]
        assert config.job_name == "ingest_team_radio"
        assert config.table == "team_radio_clips"
        assert config.conflict_cols == ["race_id", "driver_id", "date"]
        assert config.fetch is fetch_team_radio
        assert config.to_rows is _to_rows
