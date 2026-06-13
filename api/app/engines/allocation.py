from decimal import Decimal

from app.policy.rates import band_for_age
from app.engines.money import round_to_dollar


def allocate(total: Decimal, age: int, policy: dict) -> dict:
    """Split a monthly contribution into {OA, SAorRA, MA}. OA is the balancing figure."""
    ratios = policy["allocation_rates"][band_for_age(age)]
    ma = round_to_dollar(total * Decimal(str(ratios["MA"])))
    saorra = round_to_dollar(total * Decimal(str(ratios["SAorRA"])))
    oa = total - ma - saorra
    return {"OA": oa, "SAorRA": saorra, "MA": ma}
