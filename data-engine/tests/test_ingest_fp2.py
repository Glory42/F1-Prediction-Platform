from src.jobs.ingest_fp2 import select_practice_session


def test_conventional_weekend_uses_fp2():
    assert select_practice_session("conventional") == "FP2"


def test_missing_event_format_defaults_to_fp2():
    assert select_practice_session(None) == "FP2"


def test_sprint_weekend_falls_back_to_fp1():
    assert select_practice_session("sprint") == "FP1"


def test_sprint_qualifying_format_falls_back_to_fp1():
    assert select_practice_session("sprint_qualifying") == "FP1"


def test_sprint_shootout_format_falls_back_to_fp1():
    assert select_practice_session("sprint_shootout") == "FP1"