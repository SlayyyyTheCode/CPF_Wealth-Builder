from decimal import Decimal

from app.engines.srs import model_srs_withdrawal
from app.policy.tax_brackets import INCOME_TAX_2026, SRS_2026

POLICY = {"income_tax_brackets": INCOME_TAX_2026, "srs": SRS_2026}


def test_spread_10y_50pct_taxable():
    r = model_srs_withdrawal(Decimal("100000"), "spread_10y", POLICY,
                             annual_income=Decimal("40000"))
    assert len(r["years"]) == 10
    # draw 10,000/yr, taxable = 50% = 5,000 added on top of 40,000 income
    # tax/yr = income_tax(45000) - income_tax(40000) = 900 - 550 = 350
    assert r["years"][0]["draw"] == Decimal("10000.00")
    assert r["years"][0]["taxable"] == Decimal("5000.00")
    assert r["years"][0]["tax"] == Decimal("350.00")
    assert r["lifetime_tax"] == Decimal("3500.00")   # 350 * 10
    assert r["penalty"] == Decimal("0.00")
    assert r["total_cost"] == Decimal("3500.00")
    assert r["effective_rate"] == 0.035              # 3500 / 100000


def test_premature_full_taxable_plus_penalty():
    r = model_srs_withdrawal(Decimal("100000"), "premature", POLICY,
                             annual_income=Decimal("40000"))
    assert len(r["years"]) == 1
    # 100% taxable: income_tax(140000) - income_tax(40000) = 10950 - 550 = 10400
    assert r["years"][0]["taxable"] == Decimal("100000.00")
    assert r["lifetime_tax"] == Decimal("10400.00")
    assert r["penalty"] == Decimal("5000.00")        # 5% of 100,000
    assert r["total_cost"] == Decimal("15400.00")
    assert r["effective_rate"] == 0.154


def test_zero_balance_edge():
    r = model_srs_withdrawal(Decimal("0"), "spread_10y", POLICY,
                             annual_income=Decimal("80000"))
    assert r["lifetime_tax"] == Decimal("0.00")
    assert r["penalty"] == Decimal("0.00")
    assert r["total_cost"] == Decimal("0.00")
    assert r["effective_rate"] == 0.0


def test_spread_beats_premature_same_balance():
    spread = model_srs_withdrawal(Decimal("200000"), "spread_10y", POLICY,
                                  annual_income=Decimal("0"))
    prem = model_srs_withdrawal(Decimal("200000"), "premature", POLICY,
                                annual_income=Decimal("0"))
    # spreading 50%-taxable draws across 10 years should cost less than a
    # single fully-taxable lump with a 5% penalty.
    assert spread["total_cost"] < prem["total_cost"]
