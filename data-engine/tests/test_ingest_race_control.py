import src.jobs.ingest_race_control as ingest_race_control
from src.jobs.ingest_race_control import _to_rows, run
from src.utils.openf1_client import fetch_race_control


class TestToRows:
    def test_maps_a_message_to_a_row(self):
        messages = [{
            "date": "2024-11-03T15:31:01+00:00", "category": "Flag", "flag": "YELLOW",
            "lap_number": 12, "driver_number": 44, "scope": "Sector", "sector": 4,
            "message": "YELLOW IN TRACK SECTOR 4",
        }]

        rows, skipped = _to_rows(messages, race_id=1, driver_map={})

        assert skipped == 0
        assert rows == [{
            "race_id": 1, "date": "2024-11-03T15:31:01+00:00", "category": "Flag",
            "flag": "YELLOW", "lap_number": 12, "driver_number": 44,
            "scope": "Sector", "sector": 4, "message": "YELLOW IN TRACK SECTOR 4",
        }]

    def test_missing_optional_fields_map_to_none(self):
        messages = [{"date": "2024-11-03T15:31:01+00:00", "category": "Other", "message": "PIT EXIT CLOSED"}]

        rows, skipped = _to_rows(messages, race_id=1, driver_map={})

        assert skipped == 0
        row = rows[0]
        assert row["flag"] is None
        assert row["lap_number"] is None
        assert row["driver_number"] is None
        assert row["scope"] is None
        assert row["sector"] is None

    def test_empty_input_returns_empty(self):
        assert _to_rows([], race_id=1, driver_map={}) == ([], 0)


class TestRun:
    def test_wires_the_expected_config(self, monkeypatch):
        captured = {}
        monkeypatch.setattr(
            ingest_race_control, "run_openf1_job",
            lambda year, round_num, config: captured.update(year=year, round_num=round_num, config=config)
        )

        run(2024, 20)

        assert captured["year"] == 2024
        assert captured["round_num"] == 20
        config = captured["config"]
        assert config.job_name == "ingest_race_control"
        assert config.table == "race_control_messages"
        assert config.conflict_cols == ["race_id", "date", "message"]
        assert config.fetch is fetch_race_control
        assert config.to_rows is _to_rows
