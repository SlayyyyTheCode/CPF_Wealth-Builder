from datetime import date
from decimal import Decimal
import pytest

from app.engines.domain import AccountState, SimulationInput, SelfEmployedNotSupported
from app.engines.simulation import run_simulation, age_at

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


def test_age_at_month_granularity():
    assert age_at(date(1986, 1, 1), 2026, 1) == 40
    assert age_at(date(1972, 7, 1), 2026, 1) == 53   # before July birthday
    assert age_at(date(1972, 7, 1), 2026, 7) == 54


def test_single_year_closing_balances():
    inp = SimulationInput(
        opening=AccountState(),
        dob=date(1986, 1, 1),
        monthly_gross_wage=Decimal("6000"),
        employment_status="employee",
        end_age=41,
        start_year=2026,
    )
    res = run_simulation(inp, resolver)
    assert res.final.OA == Decimal("15293.25")
    assert res.final.SA == Decimal("5224.80")
    assert res.final.MA == Decimal("6628.50")
    assert res.final.RA == Decimal("0")
    assert len(res.years) == 1
    assert len(res.months) == 12
    assert [e.kind for e in res.events] == ["INTEREST_CREDITED"]
    assert res.events[0].year == 2026 and res.events[0].month == 12


def test_ra_forms_in_birth_month_of_turn_55_year():
    inp = SimulationInput(
        opening=AccountState(OA=Decimal("100000"), SA=Decimal("150000"), MA=Decimal("60000")),
        dob=date(1972, 1, 1),
        monthly_gross_wage=Decimal("6000"),
        employment_status="employee",
        end_age=56,
        start_year=2026,
    )
    res = run_simulation(inp, resolver)
    formed = [e for e in res.events if e.kind == "RA_FORMED"]
    closed = [e for e in res.events if e.kind == "SA_CLOSED"]
    assert len(formed) == 1 and formed[0].year == 2027 and formed[0].month == 1
    assert len(closed) == 1
    # after formation SA stays 0 and RA is positive
    assert res.final.SA == Decimal("0")
    assert res.final.RA > Decimal("0")


def test_determinism_same_input_same_output():
    inp = SimulationInput(
        opening=AccountState(), dob=date(1986, 1, 1),
        monthly_gross_wage=Decimal("6000"), employment_status="employee",
        end_age=43, start_year=2026,
    )
    a = run_simulation(inp, resolver)
    b = run_simulation(inp, resolver)
    assert a == b


def test_self_employed_rejected():
    inp = SimulationInput(
        opening=AccountState(), dob=date(1986, 1, 1),
        monthly_gross_wage=Decimal("6000"), employment_status="self-employed",
        end_age=41, start_year=2026,
    )
    with pytest.raises(SelfEmployedNotSupported):
        run_simulation(inp, resolver)
