from decimal import Decimal
from datetime import date
from app.engines.readiness import compute_readiness
from app.engines.cpflife import project_cpf_life


def test_readiness_default_unchanged():
    r = compute_readiness(Decimal("220400"), Decimal("220400"), Decimal("0"), Decimal("79000"))
    assert r == {"score": 70, "band": "on_track"}


def test_readiness_custom_weights():
    # all weight on MA; MA full -> score 100
    r = compute_readiness(Decimal("0"), Decimal("220400"), Decimal("79000"), Decimal("79000"),
                          weights={"w_sum": 0.0, "w_ma": 1.0}, bands={"on_track": 70, "below_frs_pace": 40})
    assert r["score"] == 100


def test_cpflife_custom_escalation_changes_start():
    pol = {"cpf_life_eligibility_min": 60000, "cpf_life": {"longevity_age": 90, "ra_rate": 0.04}}
    base = project_cpf_life(Decimal("220400"), date(1972, 1, 1), 65, "Escalating", pol)["monthly_payout"]
    pol2 = {"cpf_life_eligibility_min": 60000, "cpf_life": {"longevity_age": 90, "ra_rate": 0.04, "escalating_rate": 0.05}}
    steeper = project_cpf_life(Decimal("220400"), date(1972, 1, 1), 65, "Escalating", pol2)["monthly_payout"]
    assert steeper < base  # steeper escalation -> lower start


def test_cpflife_reads_assumptions_block():
    # assumptions.cpf_life path (snapshot style), no policy["cpf_life"]
    pol = {"cpf_life_eligibility_min": 60000,
           "assumptions": {"cpf_life": {"longevity_age": 90, "ra_rate": 0.04, "deferral_cap": 0.10}}}
    r = project_cpf_life(Decimal("220400"), date(1972, 1, 1), 70, "Standard", pol)
    assert r["deferral_bonus_applied"] == 0.10  # capped at custom 0.10
