import src.jobs.ingest_overtakes as ingest_overtakes
from src.jobs.ingest_overtakes import _to_rows, run
from src.utils.openf1_client import fetch_overtakes


class TestToRows:
    def test_maps_an_overtake_to_a_row(self):
        overtakes = [{
            "date": "2024-11-03T15:50:07+00:00",
            "overtaking_driver_number": 63, "overtaken_driver_number": 4, "position": 1,
        }]

        rows, skipped = _to_rows(overtakes, race_id=1, driver_map={63: 100, 4: 101})

        assert skipped == 0
        assert rows == [{
            "race_id": 1, "date": "2024-11-03T15:50:07+00:00",
            "overtaking_driver_id": 100, "overtaken_driver_id": 101, "position": 1,
        }]

    def test_skips_rows_with_unknown_overtaking_driver_number(self):
        overtakes = [{"date": "d", "overtaking_driver_number": 99, "overtaken_driver_number": 4, "position": 1}]

        rows, skipped = _to_rows(overtakes, race_id=1, driver_map={4: 101})

        assert rows == []
        assert skipped == 1

    def test_skips_rows_with_unknown_overtaken_driver_number(self):
        overtakes = [{"date": "d", "overtaking_driver_number": 63, "overtaken_driver_number": 99, "position": 1}]

        rows, skipped = _to_rows(overtakes, race_id=1, driver_map={63: 100})

        assert rows == []
        assert skipped == 1

    def test_empty_input_returns_empty(self):
        assert _to_rows([], race_id=1, driver_map={}) == ([], 0)


class TestRun:
    def test_wires_the_expected_config(self, monkeypatch):
        captured = {}
        monkeypatch.setattr(
            ingest_overtakes, "run_openf1_job",
            lambda year, round_num, config: captured.update(year=year, round_num=round_num, config=config)
        )

        run(2024, 20)

        assert captured["year"] == 2024
        assert captured["round_num"] == 20
        config = captured["config"]
        assert config.job_name == "ingest_overtakes"
        assert config.table == "race_overtakes"
        assert config.conflict_cols == ["race_id", "date", "overtaking_driver_id", "overtaken_driver_id"]
        assert config.fetch is fetch_overtakes
        assert config.to_rows is _to_rows
