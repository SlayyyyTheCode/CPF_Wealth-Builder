"""Growth-strategy recommendations, ranked by estimated benefit.
MRSS deferred. Reuses the CPF LIFE and tax engines."""
from datetime import date
from decimal import Decimal

from app.engines.domain import AccountState
from app.engines.cpflife import project_cpf_life
from app.engines.tax import compute_relief

ZERO = Decimal("0")


def _monthly(ra: Decimal, dob: date, payout_age: int, plan: str, policy: dict) -> float:
    return project_cpf_life(ra, dob, payout_age, plan, policy)["monthly_payout"]


def recommend_strategies(ra_at_55: Decimal, ra_at_payout: Decimal, final: AccountState,
                         income: Decimal, payout_age: int, dob: date,
                         plan: str, policy: dict) -> list[dict]:
    frs, ers, bhs = policy["frs"], policy["ers"], policy["bhs"]
    self_cap = Decimal(str(policy["rstu_caps"]["self"]))
    strategies: list[dict] = []

    # 1. ERS Top-Up
    if ra_at_payout < ers:
        topup = ers - ra_at_payout
        annual_uplift = (
            _monthly(ers, dob, payout_age, plan, policy)
            - _monthly(ra_at_payout, dob, payout_age, plan, policy)
        ) * 12
        relief = compute_relief(income, min(topup, self_cap), ZERO, ZERO, policy)
        tax_saved = float(relief["estimated_tax_saved"])
        benefit = round(annual_uplift + tax_saved, 2)
        strategies.append({
            "name": "ERS Top-Up", "trigger_met": True,
            "outputs": {
                "topup_to_ers": float(topup),
                "annual_payout_uplift": round(annual_uplift, 2),
                "estimated_tax_saved": tax_saved,
            },
            "estimated_benefit": benefit,
        })

    # 2. CPF Deferral
    if payout_age < 70:
        monthly_uplift = (
            _monthly(ra_at_payout, dob, 70, plan, policy)
            - _monthly(ra_at_payout, dob, payout_age, plan, policy)
        )
        benefit = round(monthly_uplift * 12, 2)
        strategies.append({
            "name": "CPF Deferral", "trigger_met": True,
            "outputs": {
                "defer_to_age": 70,
                "monthly_payout_uplift": round(monthly_uplift, 2),
            },
            "estimated_benefit": benefit,
        })

    # 3. Voluntary Contributions
    sa_gap = max(frs - final.SA, ZERO)
    ma_gap = max(bhs - final.MA, ZERO)
    if sa_gap > ZERO or ma_gap > ZERO:
        gap = sa_gap if sa_gap > ZERO else ma_gap
        nominal = min(gap, self_cap)
        relief = compute_relief(income, nominal, ZERO, ZERO, policy)
        benefit = float(relief["estimated_tax_saved"])
        strategies.append({
            "name": "Voluntary Contributions", "trigger_met": True,
            "outputs": {
                "suggested_topup": float(nominal),
                "estimated_tax_saved": benefit,
                "sa_gap_to_frs": float(sa_gap),
                "ma_gap_to_bhs": float(ma_gap),
            },
            "estimated_benefit": round(benefit, 2),
        })

    strategies.sort(key=lambda s: s["estimated_benefit"], reverse=True)
    return strategies
