"""Retirement scenarios A (Below BRS), B (Property Pledge), C (ERS Optimisation).
Pure functions reusing the CPF LIFE and tax engines."""
from datetime import date
from decimal import Decimal

from app.engines.cpflife import project_cpf_life
from app.engines.tax import compute_relief


def _monthly(ra: Decimal, dob: date, payout_age: int, plan: str, policy: dict) -> float:
    return project_cpf_life(ra, dob, payout_age, plan, policy)["monthly_payout"]


def scenario_below_brs(ra_at_55: Decimal, dob: date, payout_age: int,
                       plan: str, policy: dict) -> dict:
    brs = policy["brs"]
    if ra_at_55 >= brs:
        return {"triggered": False}
    shortfall = brs - ra_at_55
    return {
        "triggered": True,
        "shortfall": float(shortfall),
        "reduced_monthly_payout": _monthly(ra_at_55, dob, payout_age, plan, policy),
        "recommended_topup": float(shortfall),
    }


def scenario_property_pledge(dob: date, payout_age: int, plan: str,
                             policy: dict, eligible: bool) -> dict:
    if not eligible:
        return {"eligible": False}
    frs, brs = policy["frs"], policy["brs"]
    payout_full = _monthly(frs, dob, payout_age, plan, policy)
    payout_brs = _monthly(brs, dob, payout_age, plan, policy)
    return {
        "eligible": True,
        "freed_cash": float(frs - brs),
        "payout_full_frs": payout_full,
        "payout_brs": payout_brs,
        "payout_difference": round(payout_full - payout_brs, 2),
    }


def scenario_ers_optimisation(ra_balance: Decimal, income: Decimal, dob: date,
                              payout_age: int, plan: str, policy: dict) -> dict:
    frs, ers = policy["frs"], policy["ers"]
    self_cap = Decimal(str(policy["rstu_caps"]["self"]))
    topup_needed = max(ers - ra_balance, Decimal("0"))
    payout_uplift = round(
        _monthly(ers, dob, payout_age, plan, policy)
        - _monthly(frs, dob, payout_age, plan, policy),
        2,
    )
    tax_relief_eligible = min(topup_needed, self_cap)
    relief = compute_relief(income, tax_relief_eligible, Decimal("0"), Decimal("0"), policy)
    return {
        "ers_topup_needed": float(topup_needed),
        "payout_uplift": payout_uplift,
        "tax_relief_eligible": float(tax_relief_eligible),
        "estimated_tax_saved": float(relief["estimated_tax_saved"]),
    }
