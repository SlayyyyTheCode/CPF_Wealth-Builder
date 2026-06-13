from datetime import date
from decimal import Decimal

from app.engines.domain import AccountState, SimulationInput
from app.engines.simulation import run_simulation

POLICY = {
    "ow_ceiling": Decimal("8000"), "aw_ceiling": Decimal("102000"),
    "frs": Decimal("220400"), "brs": Decimal("110200"),
    "ers": Decimal("440800"), "bhs": Decimal("79000"),
    "cpf_life_eligibility_min": 60000,
    "cpf_life": {"longevity_age": 90, "ra_rate": 0.04},
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


def test_run_to_payout_age_yields_cpf_life():
    # born 1972; turns 55 in 2027 (RA forms), reaches 65 in 2037.
    inp = SimulationInput(
        opening=AccountState(OA=Decimal("100000"), SA=Decimal("150000"), MA=Decimal("60000")),
        dob=date(1972, 1, 1),
        monthly_gross_wage=Decimal("6000"),
        employment_status="employee",
        end_age=66,
        start_year=2026,
        payout_age=65,
        cpf_life_plan="Standard",
    )
    res = run_simulation(inp, resolver)
    assert res.cpf_life != {}
    assert res.cpf_life["eligible"] is True
    assert res.cpf_life["monthly_payout"] > 0
    assert res.cpf_life["payout_age"] == 65


def test_run_ending_before_payout_age_has_no_cpf_life():
    inp = SimulationInput(
        opening=AccountState(),
        dob=date(1986, 1, 1),
        monthly_gross_wage=Decimal("6000"),
        employment_status="employee",
        end_age=41,            # ends at 41, well before 65
        start_year=2026,
    )
    res = run_simulation(inp, resolver)
    assert res.cpf_life == {}
