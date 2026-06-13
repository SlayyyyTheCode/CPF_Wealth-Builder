from decimal import Decimal
from app.engines.money import round_to_dollar, round_to_cent


def test_round_to_dollar_half_rounds_up():
    assert round_to_dollar(Decimal("2219.50")) == Decimal("2220")
    assert round_to_dollar(Decimal("2219.49")) == Decimal("2219")
    assert round_to_dollar(Decimal("479.964")) == Decimal("480")


def test_round_to_cent_half_rounds_up():
    assert round_to_cent(Decimal("173.255")) == Decimal("173.26")
    assert round_to_cent(Decimal("92.404")) == Decimal("92.40")
    # exact half-cent boundary: .005 rounds up, .004 rounds down
    assert round_to_cent(Decimal("173.005")) == Decimal("173.01")
    assert round_to_cent(Decimal("92.004")) == Decimal("92.00")
