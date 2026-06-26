from decimal import Decimal
from app.engines.tax import income_tax, marginal_rate, compute_relief
from app.policy.tax_brackets import INCOME_TAX_2026, RSTU_CAPS_2026, SRS_2026

POLICY = {
    "income_tax_brackets": INCOME_TAX_2026,
    "rstu_caps": RSTU_CAPS_2026,
    "srs": SRS_2026,
}
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


# ── SRS (Phase 1) ───────────────────────────────────────────────────────────
def test_srs_bucket_capped_citizen():
    r = compute_relief(
        Decimal("100000"), Decimal("0"), Decimal("0"), Decimal("0"),
        POLICY, srs_contribution=Decimal("20000"), residency="citizen",
    )
    # citizen/PR cap 15,300 clips the 20,000 contribution
    assert r["srs_relief"] == Decimal("15300.00")
    assert r["srs_remaining_cap"] == Decimal("0.00")


def test_srs_bucket_capped_foreigner():
    r = compute_relief(
        Decimal("100000"), Decimal("0"), Decimal("0"), Decimal("0"),
        POLICY, srs_contribution=Decimal("40000"), residency="foreigner",
    )
    # foreigner cap 35,700
    assert r["srs_relief"] == Decimal("35700.00")


def test_srs_under_cap_keeps_remaining():
    r = compute_relief(
        Decimal("100000"), Decimal("0"), Decimal("0"), Decimal("0"),
        POLICY, srs_contribution=Decimal("5000"), residency="citizen",
    )
    assert r["srs_relief"] == Decimal("5000.00")
    assert r["srs_remaining_cap"] == Decimal("10300.00")  # 15300 - 5000


def test_total_relief_clamped_to_personal_cap():
    # Force the 80k clamp with a low personal cap so RSTU(16k)+SRS(15.3k) bites.
    low_cap = dict(POLICY, srs=dict(SRS_2026, personal_relief_cap=20000))
    r = compute_relief(
        Decimal("300000"), Decimal("10000"), Decimal("10000"), Decimal("0"),
        low_cap, srs_contribution=Decimal("15300"), residency="citizen",
    )
    # RSTU combined 16,000 + SRS 15,300 = 31,300 → clamped to 20,000
    assert r["total_relief"] == Decimal("20000.00")
    assert r["personal_cap_hit"] is True


def test_total_relief_never_exceeds_80k_default():
    r = compute_relief(
        Decimal("500000"), Decimal("10000"), Decimal("10000"), Decimal("0"),
        POLICY, srs_contribution=Decimal("35700"), residency="foreigner",
    )
    assert r["total_relief"] <= Decimal("80000.00")
    assert r["personal_cap_hit"] is False  # 16k + 35.7k = 51.7k < 80k


def test_srs_tax_saved_matches_formula():
    inc = Decimal("120000")
    r = compute_relief(
        inc, Decimal("8000"), Decimal("0"), Decimal("0"),
        POLICY, srs_contribution=Decimal("15300"), residency="citizen",
    )
    total = r["total_relief"]
    expected = income_tax(inc, B) - income_tax(inc - total, B)
    assert r["estimated_tax_saved"] == expected
    assert total == Decimal("23300.00")  # 8000 RSTU + 15300 SRS


def test_srs_zero_is_regression_safe():
    # SRS=0 must leave the original four keys identical to a no-SRS call.
    base = compute_relief(Decimal("100000"), Decimal("8000"), Decimal("0"), Decimal("0"), POLICY)
    with_srs = compute_relief(
        Decimal("100000"), Decimal("8000"), Decimal("0"), Decimal("0"),
        POLICY, srs_contribution=Decimal("0"),
    )
    for k in ("relief_earned", "remaining_cap", "estimated_tax_saved", "marginal_rate"):
        assert base[k] == with_srs[k]
    assert with_srs["srs_relief"] == Decimal("0.00")
    assert with_srs["total_relief"] == base["relief_earned"]
