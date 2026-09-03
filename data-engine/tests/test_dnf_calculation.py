import pytest


def is_dnf_status(status: str | None) -> bool:
    """Helper mirroring the SQL filter:
    WHERE rr.status NOT IN ('Finished', 'Lapped') AND rr.status NOT LIKE '+%'
    """
    if not status:
        return True
    if status in ("Finished", "Lapped"):
        return False
    if status.startswith("+"):
        return False
    return True


class TestDnfStatusClassification:
    """Tests to verify race finish vs DNF classification rules."""

    # ── Finished / Classified non-DNF statuses ───────────────────────────

    def test_finished_on_lead_lap_is_not_dnf(self):
        assert is_dnf_status("Finished") is False

    def test_lapped_classified_finisher_is_not_dnf(self):
        # FastF1 modern status for cars finishing 1+ laps behind the leader
        assert is_dnf_status("Lapped") is False

    def test_plus_laps_classified_finishers_are_not_dnf(self):
        # Ergast legacy statuses
        assert is_dnf_status("+1 Lap") is False
        assert is_dnf_status("+2 Laps") is False
        assert is_dnf_status("+3 Laps") is False
        assert is_dnf_status("+6 Laps") is False

    # ── True DNF / Retired statuses ──────────────────────────────────────

    def test_retired_is_dnf(self):
        assert is_dnf_status("Retired") is True

    def test_mechanical_failures_are_dnf(self):
        assert is_dnf_status("Engine") is True
        assert is_dnf_status("Gearbox") is True
        assert is_dnf_status("Electrical") is True
        assert is_dnf_status("Suspension") is True
        assert is_dnf_status("Brakes") is True
        assert is_dnf_status("Hydraulics") is True

    def test_incidents_are_dnf(self):
        assert is_dnf_status("Collision") is True
        assert is_dnf_status("Accident") is True
        assert is_dnf_status("Spun off") is True
        assert is_dnf_status("Collision damage") is True

    def test_non_starts_and_disqualifications_are_dnf(self):
        assert is_dnf_status("Did not start") is True
        assert is_dnf_status("Disqualified") is True
        assert is_dnf_status("Withdrew") is True

    def test_none_or_empty_is_dnf(self):
        assert is_dnf_status(None) is True
        assert is_dnf_status("") is True
