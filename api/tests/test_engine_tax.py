from decimal import Decimal
from app.engines.tax import income_tax, marginal_rate, compute_relief
from app.policy.tax_brackets import INCOME_TAX_2026, RSTU_CAPS_2026

POLICY = {"income_tax_brackets": INCOME_TAX_2026, "rstu_caps": RSTU_CAPS_2026}
B = INCOME_TAX_2026


def test_income_tax_anchors():
    assert income_tax(Decimal("20000"), B) == Decimal("0.00")
    assert income_tax(Decimal("40000"), B) == Decimal("550.00")
    assert income_tax(Decimal("80000"), B) == Decimal("3350.00")
    assert income_tax(Decimal("100000"), B) == Decimal("5650.00")


def test_marginal_rate_lookup():
    assert marginal_rate(Decimal("100000"), B) == Decimal("0.115")
    assert marginal_rate(Decimal("15000"), B) == Decimal("0.0")
    assert marginal_rate(Decimal("250000"), B) == Decimal("0.195")


def test_compute_relief_anchor_tax_saved():
    r = compute_relief(Decimal("100000"), Decimal("8000"), Decimal("0"), Decimal("0"), POLICY)
    assert r["relief_earned"] == Decimal("8000.00")
    assert r["estimated_tax_saved"] == Decimal("920.00")   # 8000 * 11.5%
    assert r["remaining_cap"] == Decimal("8000.00")
    assert r["marginal_rate"] == 0.115


def test_compute_relief_caps_clip():
    r = compute_relief(Decimal("300000"), Decimal("10000"), Decimal("10000"), Decimal("0"), POLICY)
    # self clipped 8000, family clipped 8000, combined 16000
    assert r["relief_earned"] == Decimal("16000.00")
    assert r["remaining_cap"] == Decimal("0.00")


def test_voluntary_folds_into_self_bucket():
    r = compute_relief(Decimal("100000"), Decimal("5000"), Decimal("0"), Decimal("5000"), POLICY)
    # 5000 + 5000 = 10000 clipped to self cap 8000
    assert r["relief_earned"] == Decimal("8000.00")
