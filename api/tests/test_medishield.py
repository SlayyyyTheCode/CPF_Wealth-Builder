from decimal import Decimal
from app.policy.medishield import premium_for_age, MEDISHIELD_PREMIUMS_2026 as T


def test_premium_band_edges():
    assert premium_for_age(20, T) == Decimal("200")
    assert premium_for_age(21, T) == Decimal("435")
    assert premium_for_age(85, T) == Decimal("2330")
    assert premium_for_age(95, T) == Decimal("2620")
