from decimal import Decimal, ROUND_HALF_UP


def round_to_dollar(amount: Decimal) -> Decimal:
    return amount.quantize(Decimal("1"), rounding=ROUND_HALF_UP)


def round_to_cent(amount: Decimal) -> Decimal:
    return amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
