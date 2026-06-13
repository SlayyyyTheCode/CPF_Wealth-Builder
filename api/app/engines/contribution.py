from decimal import Decimal

from app.policy.rates import band_for_age
from app.engines.money import round_to_dollar


def monthly_contribution(wage: Decimal, age: int, policy: dict) -> Decimal:
    """Total (employee + employer) monthly CPF contribution, rounded to the dollar."""
    ow = min(wage, policy["ow_ceiling"])
    rate = Decimal(str(policy["contribution_rates"][band_for_age(age)]))
    return round_to_dollar(ow * rate)
