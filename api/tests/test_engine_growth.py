from datetime import date
from decimal import Decimal

from app.engines.domain import AccountState
from app.engines.growth import recommend_strategies
from app.policy.tax_brackets import INCOME_TAX_2026, RSTU_CAPS_2026

POLICY = {
    "frs": Decimal("220400"), "brs": Decimal("110200"), "ers": Decimal("440800"),
    "bhs": Decimal("79000"), "cpf_life_eligibility_min": 60000,
    "cpf_life": {"longevity_age": 90, "ra_rate": 0.04},
    "income_tax_brackets": INCOME_TAX_2026, "rstu_caps": RSTU_CAPS_2026,
}
DOB = date(1972, 1, 1)


def _run(ra_payout=Decimal("260000"), final=None, payout_age=65):
    final = final or AccountState(SA=Decimal("100000"), MA=Decimal("50000"))
    return recommend_strategies(
        ra_at_55=Decimal("220400"), ra_at_payout=ra_payout, final=final,
        income=Decimal("100000"), payout_age=payout_age, dob=DOB,
        plan="Standard", policy=POLICY,
    )


def test_all_three_triggered_and_ranked():
    strategies = _run()
    names = [s["name"] for s in strategies]
    assert set(names) == {"ERS Top-Up", "CPF Deferral", "Voluntary Contributions"}
    assert all(s["trigger_met"] for s in strategies)
    benefits = [s["estimated_benefit"] for s in strategies]
    assert benefits == sorted(benefits, reverse=True)   # ranked desc


def test_ers_topup_not_triggered_when_ra_at_ers():
    strategies = _run(ra_payout=Decimal("440800"))
    assert "ERS Top-Up" not in [s["name"] for s in strategies]


def test_deferral_not_triggered_at_70():
    strategies = _run(payout_age=70)
    assert "CPF Deferral" not in [s["name"] for s in strategies]


def test_voluntary_not_triggered_when_sa_and_ma_full():
    full = AccountState(SA=Decimal("250000"), MA=Decimal("90000"))
    strategies = _run(final=full)
    assert "Voluntary Contributions" not in [s["name"] for s in strategies]
