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


def compute_relief(income, rstu_self, rstu_family, voluntary_cpf, policy: dict,
                   srs_contribution=0, residency="citizen") -> dict:
    """RSTU/voluntary top-up + SRS relief with caps and estimated tax saved.

    voluntary_cpf is folded into the self bucket (documented simplification).
    SRS adds a third bucket capped by residency (citizen/PR vs foreigner). The
    grand total of all reliefs is then clamped to the YA personal relief cap
    (policy["srs"]["personal_relief_cap"], $80k). The clamp is on the *total*,
    not the SRS bucket alone. New params default so existing callers are
    unaffected (SRS=0 → identical legacy output)."""
    caps = policy["rstu_caps"]
    brackets = policy["income_tax_brackets"]
    srs_cfg = policy.get("srs")
    d = lambda v: Decimal(str(v))

    self_bucket = min(d(rstu_self) + d(voluntary_cpf), d(caps["self"]))
    family_bucket = min(d(rstu_family), d(caps["family"]))
    rstu_relief = min(self_bucket + family_bucket, d(caps["combined"]))

    # SRS bucket: clip the contribution to the residency-specific cap.
    if srs_cfg:
        srs_cap = d(srs_cfg["cap_foreigner"]) if residency == "foreigner" \
            else d(srs_cfg["cap_citizen_pr"])
    else:
        srs_cap = ZERO
    srs_bucket = min(d(srs_contribution), srs_cap)

    # Grand-total clamp to the personal relief ceiling (applies to the sum).
    total = rstu_relief + srs_bucket
    personal_cap_hit = False
    if srs_cfg:
        personal_cap = d(srs_cfg["personal_relief_cap"])
        if total > personal_cap:
            total = personal_cap
            personal_cap_hit = True

    inc = d(income)
    tax_saved = income_tax(inc, brackets) - income_tax(inc - total, brackets)

    return {
        "relief_earned": round_to_cent(rstu_relief),
        "remaining_cap": round_to_cent(d(caps["combined"]) - rstu_relief),
        "estimated_tax_saved": round_to_cent(tax_saved),
        "marginal_rate": float(marginal_rate(inc, brackets)),
        "srs_relief": round_to_cent(srs_bucket),
        "srs_remaining_cap": round_to_cent(srs_cap - srs_bucket),
        "total_relief": round_to_cent(total),
        "personal_cap_hit": personal_cap_hit,
    }
