from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.policy import PolicySnapshot
from app.policy.tax_brackets import INCOME_TAX_2026, RSTU_CAPS_2026
from app.policy.medishield import MEDISHIELD_PREMIUMS_2026
from app.policy.assumptions import ASSUMPTIONS_2026

CENT = Decimal("0.01")


def snapshot_to_policy(snap: PolicySnapshot) -> dict:
    d = lambda v: Decimal(str(v))
    return {
        "ow_ceiling": d(snap.ordinary_wage_ceiling),
        "aw_ceiling": d(snap.additional_wage_ceiling),
        "frs": d(snap.frs),
        "brs": d(snap.brs),
        "ers": d(snap.ers),
        "bhs": d(snap.bhs),
        "cpf_life_eligibility_min": d(snap.cpf_life_eligibility_min),
        "contribution_rates": snap.contribution_rates,
        "allocation_rates": snap.allocation_rates,
        "interest_rates": snap.interest_rates,
        "income_tax_brackets": snap.income_tax_brackets or INCOME_TAX_2026,
        "rstu_caps": snap.rstu_caps or RSTU_CAPS_2026,
        "medishield_premiums": snap.medishield_premiums or MEDISHIELD_PREMIUMS_2026,
        "assumptions": snap.assumptions or ASSUMPTIONS_2026,
    }


@dataclass(frozen=True)
class GrowthAssumptions:
    sum_rate: Decimal = Decimal("0.035")   # FRS / BRS / ERS per year
    bhs_rate: Decimal = Decimal("0.045")   # BHS per year


def project_policy(base_policy: dict, base_year: int, target_year: int,
                   growth: GrowthAssumptions) -> dict:
    """Project retirement sums forward; all other keys unchanged."""
    exp = max(target_year - base_year, 0)
    if exp == 0:
        return dict(base_policy)
    sum_factor = (1 + growth.sum_rate) ** exp
    bhs_factor = (1 + growth.bhs_rate) ** exp
    projected = dict(base_policy)
    for key in ("frs", "brs", "ers"):
        projected[key] = (base_policy[key] * sum_factor).quantize(CENT)
    projected["bhs"] = (base_policy["bhs"] * bhs_factor).quantize(CENT)
    return projected


def make_db_resolver(db: Session, growth: GrowthAssumptions | None = None):
    cache: dict[int, dict] = {}

    def resolve(year: int) -> dict:
        if year in cache:
            return cache[year]
        actives = db.scalars(
            select(PolicySnapshot).where(PolicySnapshot.status == "active")
        ).all()
        if not actives:
            raise ValueError("no active policy snapshot")
        at_or_before = [s for s in actives if s.effective_year <= year]
        chosen = (
            max(at_or_before, key=lambda s: s.effective_year)
            if at_or_before
            else min(actives, key=lambda s: s.effective_year)
        )
        policy = snapshot_to_policy(chosen)
        if growth is not None:
            policy = project_policy(policy, chosen.effective_year, year, growth)
        cache[year] = policy
        return cache[year]

    return resolve
