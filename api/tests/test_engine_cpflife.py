from datetime import date
from decimal import Decimal
import pytest

from app.engines.cpflife import project_cpf_life

POLICY = {
    "cpf_life_eligibility_min": 60000,
    "cpf_life": {"longevity_age": 90, "ra_rate": 0.04},
}
ELIGIBLE_DOB = date(1972, 1, 1)


def test_standard_matches_pmt_closed_form():
    ra = Decimal("220400")
    res = project_cpf_life(ra, ELIGIBLE_DOB, 65, "Standard", POLICY)
    # independent annuity-certain PMT derivation: pv * r / (1 - (1+r)^-n)
    r = Decimal("0.04") / 12
    n = (90 - 65) * 12
    expected = ra * r / (1 - (1 + r) ** (-n))
    assert res["monthly_payout"] == pytest.approx(float(expected), abs=0.01)
    assert res["eligible"] is True


def test_plan_start_ordering_escalating_lt_standard_lt_basic():
    ra = Decimal("220400")
    esc = project_cpf_life(ra, ELIGIBLE_DOB, 65, "Escalating", POLICY)["monthly_payout"]
    std = project_cpf_life(ra, ELIGIBLE_DOB, 65, "Standard", POLICY)["monthly_payout"]
    bas = project_cpf_life(ra, ELIGIBLE_DOB, 65, "Basic", POLICY)["monthly_payout"]
    assert esc < std < bas


def test_deferral_bonus_values_and_uplift():
    ra = Decimal("220400")
    at65 = project_cpf_life(ra, ELIGIBLE_DOB, 65, "Standard", POLICY)
    at70 = project_cpf_life(ra, ELIGIBLE_DOB, 70, "Standard", POLICY)
    assert at65["deferral_bonus_applied"] == 0.0
    assert at70["deferral_bonus_applied"] == pytest.approx(0.35)
    assert at70["monthly_payout"] > at65["monthly_payout"]


def test_ineligible_born_before_1958():
    res = project_cpf_life(Decimal("220400"), date(1957, 6, 1), 65, "Standard", POLICY)
    assert res["eligible"] is False
    assert res["monthly_payout"] == 0.0
    assert res["lifetime_payout"] == 0.0


def test_ineligible_low_ra():
    res = project_cpf_life(Decimal("50000"), ELIGIBLE_DOB, 65, "Standard", POLICY)
    assert res["eligible"] is False
    assert res["monthly_payout"] == 0.0


def test_validation_errors():
    with pytest.raises(ValueError):
        project_cpf_life(Decimal("220400"), ELIGIBLE_DOB, 64, "Standard", POLICY)
    with pytest.raises(ValueError):
        project_cpf_life(Decimal("220400"), ELIGIBLE_DOB, 71, "Standard", POLICY)
    with pytest.raises(ValueError):
        project_cpf_life(Decimal("220400"), ELIGIBLE_DOB, 65, "Premium", POLICY)


def test_lifetime_exceeds_premium_and_breakeven_in_range():
    ra = Decimal("220400")
    res = project_cpf_life(ra, ELIGIBLE_DOB, 65, "Standard", POLICY)
    assert res["lifetime_payout"] > float(ra)        # interest makes total > premium
    assert 65 < res["break_even_age"] < 90
