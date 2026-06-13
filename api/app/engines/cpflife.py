"""CPF LIFE payout projection.

Transparent annuity estimate (NOT CPF's pooled actuarial table): the RA balance is
treated as an annuity-certain earning the RA interest rate, paid monthly to a fixed
longevity age. Standard = level; Escalating = +2%/yr; Basic = -3%/yr (documented
declining approximation). Deferral past 65 adds +7%/yr (capped +35% at 70).
"""
from datetime import date
from decimal import Decimal
from math import ceil

from app.engines.money import round_to_cent

ZERO = Decimal("0")
PLANS = {"Standard", "Escalating", "Basic"}
_ESCALATION = {"Standard": Decimal("1"), "Escalating": Decimal("1.02"), "Basic": Decimal("0.97")}


def _shape(plan: str, year_index: int) -> Decimal:
    """Relative payment in a given payout year (year 0 = first 12 months)."""
    factor = _ESCALATION[plan]
    if factor == Decimal("1"):
        return Decimal("1")
    return factor ** year_index


def project_cpf_life(ra_at_payout: Decimal, dob: date, payout_age: int,
                     plan: str, policy: dict) -> dict:
    if payout_age < 65 or payout_age > 70:
        raise ValueError("payout_age must be in [65, 70]")
    if plan not in PLANS:
        raise ValueError(f"unknown CPF LIFE plan: {plan}")

    # Merge assumptions.cpf_life (snapshot path) with policy["cpf_life"] (direct path).
    # policy["cpf_life"] takes precedence so existing tests with hand-crafted policy
    # dicts remain unaffected.
    cfg = {
        **policy.get("assumptions", {}).get("cpf_life", {}),
        **policy.get("cpf_life", {}),
    }

    elig_min = Decimal(str(
        policy.get("cpf_life_eligibility_min", cfg.get("payout_eligibility_min", 60000))
    ))
    longevity = int(cfg.get("longevity_age", 90))
    r = Decimal(str(cfg.get("ra_rate", 0.04))) / 12

    # Overridable escalation / decline / deferral params (fall back to current constants).
    esc_rate = float(cfg.get("escalating_rate", 0.02))
    basic_decline = float(cfg.get("basic_decline", 0.03))
    deferral_per_year = Decimal(str(cfg.get("deferral_per_year", 0.07)))
    deferral_cap = Decimal(str(cfg.get("deferral_cap", 0.35)))

    deferral_bonus = min(deferral_per_year * (payout_age - 65), deferral_cap)
    eligible = (dob.year >= 1958) and (ra_at_payout >= elig_min)

    base = {
        "plan": plan,
        "payout_age": payout_age,
        "deferral_bonus_applied": float(deferral_bonus),
        "eligible": eligible,
    }
    if not eligible:
        return {**base, "monthly_payout": 0.0, "annual_payout": 0.0,
                "lifetime_payout": 0.0, "break_even_age": 0}

    ra_effective = ra_at_payout * (1 + deferral_bonus)
    n = (longevity - payout_age) * 12
    one_plus_r = 1 + r

    # Build per-call escalation factor from overridable params.
    _escalation = {
        "Standard": Decimal("1"),
        "Escalating": Decimal(str(1 + esc_rate)),
        "Basic": Decimal(str(1 - basic_decline)),
    }

    def _shape_local(plan: str, year_index: int) -> Decimal:
        factor = _escalation[plan]
        if factor == Decimal("1"):
            return Decimal("1")
        return factor ** year_index

    shapes = [_shape_local(plan, (k - 1) // 12) for k in range(1, n + 1)]
    pv_factor = sum((shapes[k - 1] / (one_plus_r ** k) for k in range(1, n + 1)), ZERO)
    p0 = ra_effective / pv_factor

    monthly = round_to_cent(p0 * shapes[0])
    annual = round_to_cent(sum((p0 * shapes[k] for k in range(12)), ZERO))
    lifetime = round_to_cent(sum((p0 * s for s in shapes), ZERO))

    cum = ZERO
    months_to_recover = n
    for k in range(n):
        cum += p0 * shapes[k]
        if cum >= ra_at_payout:
            months_to_recover = k + 1
            break
    break_even_age = payout_age + ceil(months_to_recover / 12)

    return {
        **base,
        "monthly_payout": float(monthly),
        "annual_payout": float(annual),
        "lifetime_payout": float(lifetime),
        "break_even_age": break_even_age,
    }
