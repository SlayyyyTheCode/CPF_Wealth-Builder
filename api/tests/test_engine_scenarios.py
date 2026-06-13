from datetime import date
from decimal import Decimal

from app.engines.scenarios import (
    scenario_below_brs, scenario_property_pledge, scenario_ers_optimisation,
)
from app.policy.tax_brackets import INCOME_TAX_2026, RSTU_CAPS_2026

POLICY = {
    "frs": Decimal("220400"), "brs": Decimal("110200"), "ers": Decimal("440800"),
    "cpf_life_eligibility_min": 60000,
    "cpf_life": {"longevity_age": 90, "ra_rate": 0.04},
    "income_tax_brackets": INCOME_TAX_2026, "rstu_caps": RSTU_CAPS_2026,
}
DOB = date(1972, 1, 1)


def test_scenario_a_triggered_below_brs():
    res = scenario_below_brs(Decimal("80000"), DOB, 65, "Standard", POLICY)
    assert res["triggered"] is True
    assert res["shortfall"] == 30200.0          # 110200 - 80000
    assert res["recommended_topup"] == 30200.0
    assert res["reduced_monthly_payout"] > 0


def test_scenario_a_not_triggered_above_brs():
    res = scenario_below_brs(Decimal("150000"), DOB, 65, "Standard", POLICY)
    assert res["triggered"] is False


def test_scenario_b_property_pledge_eligible():
    res = scenario_property_pledge(DOB, 65, "Standard", POLICY, eligible=True)
    assert res["eligible"] is True
    assert res["freed_cash"] == 110200.0        # FRS - BRS
    assert res["payout_full_frs"] > res["payout_brs"]
    assert res["payout_difference"] == round(res["payout_full_frs"] - res["payout_brs"], 2)


def test_scenario_b_not_eligible():
    res = scenario_property_pledge(DOB, 65, "Standard", POLICY, eligible=False)
    assert res["eligible"] is False


def test_scenario_c_ers_optimisation():
    res = scenario_ers_optimisation(Decimal("220400"), Decimal("100000"), DOB, 65, "Standard", POLICY)
    assert res["ers_topup_needed"] == 220400.0  # 440800 - 220400
    assert res["payout_uplift"] > 0
    assert res["tax_relief_eligible"] == 8000.0  # min(topup, self cap)
    assert res["estimated_tax_saved"] > 0
