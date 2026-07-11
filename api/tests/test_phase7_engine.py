"""Phase 7 BE-1: per-year per-account interest and overflow_out in YearResult."""
from datetime import date
from decimal import Decimal

import pytest

from app.engines.domain import AccountState, SimulationInput
from app.engines.simulation import run_simulation
from app.engines.serialize import serialize_result

# Reuse the same POLICY dict as test_engine_simulation.py
POLICY = {
    "ow_ceiling": Decimal("8000"),
    "aw_ceiling": Decimal("102000"),
    "frs": Decimal("220400"), "brs": Decimal("110200"),
    "ers": Decimal("440800"), "bhs": Decimal("79000"),
    "contribution_rates": {
        "<=35": 0.37, "35-45": 0.37, "45-50": 0.37, "50-55": 0.37,
        "55-60": 0.34, "60-65": 0.25, "65-70": 0.165, ">70": 0.125,
    },
    "allocation_rates": {
        "<=35": {"OA": 0.6217, "SAorRA": 0.1621, "MA": 0.2162},
        "35-45": {"OA": 0.5677, "SAorRA": 0.1891, "MA": 0.2432},
        "45-50": {"OA": 0.5136, "SAorRA": 0.2162, "MA": 0.2702},
        "50-55": {"OA": 0.4055, "SAorRA": 0.3108, "MA": 0.2837},
        "55-60": {"OA": 0.3530, "SAorRA": 0.3382, "MA": 0.3088},
        "60-65": {"OA": 0.1400, "SAorRA": 0.4400, "MA": 0.4200},
        "65-70": {"OA": 0.0607, "SAorRA": 0.3030, "MA": 0.6363},
        ">70": {"OA": 0.0800, "SAorRA": 0.0800, "MA": 0.8400},
    },
    "interest_rates": {
        "base": {"OA": 0.025, "SA": 0.04, "MA": 0.04, "RA": 0.04},
        "extra_under55": {"rate": 0.01, "cap_combined": 60000, "oa_cap": 20000},
        "extra_55plus": {"tier1_rate": 0.02, "tier1_cap": 30000,
                         "tier2_rate": 0.01, "tier2_cap": 30000, "oa_cap": 20000},
        "priority": ["RA", "OA", "SA", "MA"],
    },
}


def resolver(_year):
    return POLICY


ACCOUNTS = ("OA", "SA", "MA", "RA")
OVERFLOW_KEYS = {
    "ma_to_sa", "ma_to_oa", "ma_to_ra", "sa_to_oa", "sa_to_ra",
    "oa_to_ra",  # age-55 RA formation drawing on the OA
}


def test_each_year_has_interest_by_account_with_all_four_keys():
    """Every serialized YearResult must have interest_by_account with OA/SA/MA/RA."""
    inp = SimulationInput(
        opening=AccountState(),
        dob=date(1986, 1, 1),
        monthly_gross_wage=Decimal("6000"),
        employment_status="employee",
        end_age=60,
        start_year=2026,
    )
    res = run_simulation(inp, resolver)
    serialized = serialize_result(res)
    for yr in serialized["years"]:
        assert "interest_by_account" in yr, f"Missing interest_by_account in year {yr['year']}"
        for acct in ACCOUNTS:
            assert acct in yr["interest_by_account"], (
                f"Missing account {acct} in interest_by_account for year {yr['year']}"
            )


def test_each_year_has_overflow_out_with_all_routing_keys():
    """Every serialized YearResult must have overflow_out with all routing keys.

    oa_to_ra was added so consumers can see the age-55 OA -> RA sweep, which was
    previously only in the event log."""
    inp = SimulationInput(
        opening=AccountState(),
        dob=date(1986, 1, 1),
        monthly_gross_wage=Decimal("6000"),
        employment_status="employee",
        end_age=60,
        start_year=2026,
    )
    res = run_simulation(inp, resolver)
    serialized = serialize_result(res)
    for yr in serialized["years"]:
        assert "overflow_out" in yr, f"Missing overflow_out in year {yr['year']}"
        assert set(yr["overflow_out"].keys()) == OVERFLOW_KEYS, (
            f"Wrong overflow_out keys in year {yr['year']}: {set(yr['overflow_out'].keys())}"
        )


def test_ma_interest_positive_in_at_least_one_year():
    """MA account must earn interest > 0 in at least one year (non-zero balance)."""
    inp = SimulationInput(
        opening=AccountState(),
        dob=date(1986, 1, 1),
        monthly_gross_wage=Decimal("6000"),
        employment_status="employee",
        end_age=60,
        start_year=2026,
    )
    res = run_simulation(inp, resolver)
    serialized = serialize_result(res)
    ma_interests = [yr["interest_by_account"]["MA"] for yr in serialized["years"]]
    assert any(v > 0 for v in ma_interests), "Expected MA interest > 0 in at least one year"


def test_overflow_ma_to_sa_tracked_when_ma_full():
    """When MA is near BHS, MA overflow should route to SA and be captured in overflow_out."""
    inp = SimulationInput(
        # MA at 78900 (near BHS=79000) so first contribution overflows to SA
        opening=AccountState(MA=Decimal("78900"), SA=Decimal("0"), OA=Decimal("0")),
        dob=date(1986, 1, 1),
        monthly_gross_wage=Decimal("6000"),
        employment_status="employee",
        end_age=41,
        start_year=2026,
    )
    res = run_simulation(inp, resolver)
    serialized = serialize_result(res)
    # At least year 1 should show ma_to_sa > 0
    yr0 = serialized["years"][0]
    assert yr0["overflow_out"]["ma_to_sa"] > 0, (
        f"Expected ma_to_sa > 0 but got {yr0['overflow_out']['ma_to_sa']}"
    )


def test_interest_by_account_oa_positive_in_first_year():
    """OA account earns interest from contributions — should be > 0 in first year."""
    inp = SimulationInput(
        opening=AccountState(),
        dob=date(1986, 1, 1),
        monthly_gross_wage=Decimal("6000"),
        employment_status="employee",
        end_age=41,
        start_year=2026,
    )
    res = run_simulation(inp, resolver)
    serialized = serialize_result(res)
    yr0 = serialized["years"][0]
    assert yr0["interest_by_account"]["OA"] > 0, (
        f"Expected OA interest > 0 in first year, got {yr0['interest_by_account']['OA']}"
    )


def test_interest_by_account_sums_close_to_interest_base_plus_extra():
    """Sum of interest_by_account values should equal interest_base + interest_extra."""
    inp = SimulationInput(
        opening=AccountState(),
        dob=date(1986, 1, 1),
        monthly_gross_wage=Decimal("6000"),
        employment_status="employee",
        end_age=41,
        start_year=2026,
    )
    res = run_simulation(inp, resolver)
    serialized = serialize_result(res)
    for yr in serialized["years"]:
        acct_sum = sum(yr["interest_by_account"].values())
        total = yr["interest_base"] + yr["interest_extra"]
        assert abs(acct_sum - total) < 0.02, (
            f"Year {yr['year']}: interest_by_account sum {acct_sum} != "
            f"interest_base+extra {total}"
        )
