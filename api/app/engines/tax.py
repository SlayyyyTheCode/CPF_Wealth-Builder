"""Singapore resident income tax + CPF top-up relief."""
from decimal import Decimal

from app.engines.money import round_to_cent

ZERO = Decimal("0")


def income_tax(chargeable, brackets: list) -> Decimal:
    """Progressive total tax on chargeable income."""
    chargeable = Decimal(str(chargeable))
    if chargeable <= ZERO:
        return ZERO
    tax = ZERO
    lower = ZERO
    for band in brackets:
        upper = band["upper"]
        rate = Decimal(str(band["rate"]))
        cap = Decimal(str(upper)) if upper is not None else None
        top = chargeable if (cap is None or chargeable < cap) else cap
        if top > lower:
            tax += (top - lower) * rate
        if cap is not None and chargeable <= cap:
            break
        lower = cap if cap is not None else lower
    return round_to_cent(tax)


def marginal_rate(income, brackets: list) -> Decimal:
    income = Decimal(str(income))
    for band in brackets:
        upper = band["upper"]
        if upper is None or income <= Decimal(str(upper)):
            return Decimal(str(band["rate"]))
    return Decimal(str(brackets[-1]["rate"]))


def compute_relief(income, rstu_self, rstu_family, voluntary_cpf, policy: dict) -> dict:
    """RSTU/voluntary top-up relief with caps + estimated tax saved.
    voluntary_cpf is folded into the self bucket (documented simplification)."""
    caps = policy["rstu_caps"]
    brackets = policy["income_tax_brackets"]
    d = lambda v: Decimal(str(v))

    self_bucket = min(d(rstu_self) + d(voluntary_cpf), d(caps["self"]))
    family_bucket = min(d(rstu_family), d(caps["family"]))
    relief = min(self_bucket + family_bucket, d(caps["combined"]))

    inc = d(income)
    tax_saved = income_tax(inc, brackets) - income_tax(inc - relief, brackets)
    remaining = d(caps["combined"]) - relief

    return {
        "relief_earned": round_to_cent(relief),
        "remaining_cap": round_to_cent(remaining),
        "estimated_tax_saved": round_to_cent(tax_saved),
        "marginal_rate": float(marginal_rate(inc, brackets)),
    }
