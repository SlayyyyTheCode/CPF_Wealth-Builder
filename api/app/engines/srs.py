"""SRS withdrawal modeling.

Two modes, both policy-driven (reads policy["srs"]):

- spread_10y: withdraw the balance evenly over the statutory window
  (withdrawal_years). Only taxable_fraction (50%) of each draw is taxable,
  stacked on top of that year's other chargeable income. No penalty.
- premature: a single full-balance withdrawal before the retirement age.
  100% taxable in one year *and* a premature_penalty (5%) on the amount.
"""
from decimal import Decimal

from app.engines.money import round_to_cent
from app.engines.tax import income_tax

ZERO = Decimal("0")


def model_srs_withdrawal(balance, mode, policy: dict, annual_income=0,
                         brackets=None) -> dict:
    """Per-year + lifetime tax/penalty for an SRS drawdown.

    annual_income is the member's other chargeable income in each withdrawal
    year (held constant across the window). Returns per-year rows, lifetime
    tax, penalty, total cost (tax + penalty) and the effective rate of that
    total against the balance withdrawn.
    """
    srs = policy["srs"]
    brackets = brackets if brackets is not None else policy["income_tax_brackets"]
    d = lambda v: Decimal(str(v))

    balance = d(balance)
    inc = d(annual_income)
    taxable_fraction = d(srs["taxable_fraction"])

    if mode == "premature":
        years_n = 1
        draw = balance
        taxable = balance                       # 100% taxable
        penalty = round_to_cent(balance * d(srs["premature_penalty"]))
    elif mode == "spread_10y":
        years_n = int(srs["withdrawal_years"])
        draw = balance / years_n if years_n else ZERO
        taxable = draw * taxable_fraction       # 50% taxable
        penalty = ZERO
    else:
        raise ValueError(f"unknown SRS withdrawal mode: {mode!r}")

    base_tax = income_tax(inc, brackets)
    year_tax = income_tax(inc + taxable, brackets) - base_tax

    years = [
        {
            "year": i + 1,
            "draw": round_to_cent(draw),
            "taxable": round_to_cent(taxable),
            "tax": round_to_cent(year_tax),
        }
        for i in range(years_n)
    ]

    lifetime_tax = round_to_cent(year_tax * years_n)
    total_cost = round_to_cent(lifetime_tax + penalty)
    effective_rate = (
        float((total_cost / balance).quantize(Decimal("0.0001"))) if balance > ZERO else 0.0
    )

    return {
        "mode": mode,
        "years": years,
        "lifetime_tax": lifetime_tax,
        "penalty": round_to_cent(penalty),
        "total_cost": total_cost,
        "effective_rate": effective_rate,
    }
