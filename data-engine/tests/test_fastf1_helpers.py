import pandas as pd

from src.utils.fastf1_helpers import ms_to_int


class TestMsToInt:
    def test_converts_timedelta_to_milliseconds(self):
        assert ms_to_int(pd.Timedelta(seconds=80)) == 80000

    def test_converts_timedelta_string_to_milliseconds(self):
        assert ms_to_int("0 days 00:01:20.123000") == 80123

    def test_nat_returns_none(self):
        assert ms_to_int(pd.NaT) is None

    def test_none_returns_none(self):
        assert ms_to_int(None) is None

    def test_nan_returns_none(self):
        assert ms_to_int(float("nan")) is None

    def test_unparseable_value_returns_none(self):
        assert ms_to_int("not-a-time") is None

    def test_zero_timedelta_returns_zero(self):
        assert ms_to_int(pd.Timedelta(0)) == 0
