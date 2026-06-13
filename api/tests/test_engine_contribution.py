from decimal import Decimal
from app.engines.contribution import monthly_contribution

POLICY = {
    "ow_ceiling": Decimal("8000"),
    "contribution_rates": {
        "<=35": 0.37, "35-45": 0.37, "45-50": 0.37, "50-55": 0.37,
        "55-60": 0.34, "60-65": 0.25, "65-70": 0.165, ">70": 0.125,
    },
}


def test_contribution_age40_wage6000():
    assert monthly_contribution(Decimal("6000"), 40, POLICY) == Decimal("2220")


def test_contribution_clips_to_ow_ceiling():
    # wage 10000 clipped to 8000 -> 8000 * 0.37 = 2960
    assert monthly_contribution(Decimal("10000"), 40, POLICY) == Decimal("2960")


def test_contribution_age58_uses_55_60_rate():
    # 6000 * 0.34 = 2040
    assert monthly_contribution(Decimal("6000"), 58, POLICY) == Decimal("2040")
