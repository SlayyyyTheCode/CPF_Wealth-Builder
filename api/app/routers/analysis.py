from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.member import MemberProfile
from app.models.policy import PolicySnapshot
from app.engines.domain import AccountState, SimulationInput, SelfEmployedNotSupported
from app.engines.policy_resolver import (
    make_db_resolver, snapshot_to_policy, GrowthAssumptions,
)
from app.engines.simulation import run_simulation
from app.engines.scenarios import (
    scenario_below_brs, scenario_property_pledge, scenario_ers_optimisation,
)
from app.engines.growth import recommend_strategies
from app.engines.tax import compute_relief, income_tax, marginal_rate
from app.engines.srs import model_srs_withdrawal
from app.schemas.analysis import (
    AnalysisRequest, AnalysisResponse, TaxReliefRequest, TaxEstimateRequest,
    SrsWithdrawalRequest,
)

router = APIRouter(tags=["analysis"])

ZERO = Decimal("0")


def _balances_to_state(balances: dict) -> AccountState:
    return AccountState(
        OA=Decimal(str(balances.get("OA", 0))),
        SA=Decimal(str(balances.get("SA", 0))),
        MA=Decimal(str(balances.get("MA", 0))),
        RA=Decimal(str(balances.get("RA", 0))),
    )


@router.post("/members/{member_id}/analysis", response_model=AnalysisResponse)
def analyse(member_id: int, req: AnalysisRequest, db: Session = Depends(get_db)):
    member = db.get(MemberProfile, member_id)
    if not member:
        raise HTTPException(404, "Member not found")

    # Resolve growth rates: use request values when provided, else fall back to
    # the active policy's editable assumptions.
    if req.apply_growth:
        _assumptions_resolve = make_db_resolver(db, None)
        g = _assumptions_resolve(date.today().year).get("assumptions", {}).get("growth", {})
        sum_rate = req.growth_sum_rate if req.growth_sum_rate is not None else g.get("sum_rate", 0.035)
        bhs_rate = req.growth_bhs_rate if req.growth_bhs_rate is not None else g.get("bhs_rate", 0.045)
        growth = GrowthAssumptions(
            sum_rate=Decimal(str(sum_rate)),
            bhs_rate=Decimal(str(bhs_rate)),
        )
    else:
        growth = None
    resolve = make_db_resolver(db, growth)

    inp = SimulationInput(
        opening=_balances_to_state(member.balances),
        dob=member.dob,
        monthly_gross_wage=Decimal(str(member.monthly_gross_wage)),
        employment_status=member.employment_status,
        end_age=req.end_age,
        start_year=date.today().year,
        retirement_sum_target=req.retirement_sum_target,
        cpf_life_plan=req.cpf_life_plan,
        payout_age=req.payout_age,
    )
    try:
        res = run_simulation(inp, resolve)
    except SelfEmployedNotSupported as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc))

    policy = resolve(member.dob.year + req.payout_age)
    income = Decimal(str(req.annual_assessable_income))
    plan, payout_age, dob = req.cpf_life_plan, req.payout_age, member.dob

    ra_at_55 = next(
        (Decimal(str(e.detail["ra_formed"])) for e in res.events if e.kind == "RA_FORMED"),
        None,
    )
    ra_at_payout = res.ra_at_payout if res.ra_at_payout is not None else res.final.RA

    scenarios = {
        "below_brs": (
            scenario_below_brs(ra_at_55, dob, payout_age, plan, policy)
            if ra_at_55 is not None else {"available": False}
        ),
        "property_pledge": scenario_property_pledge(
            dob, payout_age, plan, policy, req.property_pledge_eligible
        ),
        "ers_optimisation": scenario_ers_optimisation(
            ra_at_payout, income, dob, payout_age, plan, policy
        ),
    }
    strategies = recommend_strategies(
        ra_at_55=ra_at_55 if ra_at_55 is not None else ZERO,
        ra_at_payout=ra_at_payout, final=res.final, income=income,
        payout_age=payout_age, dob=dob, plan=plan, policy=policy,
    )
    return {"scenarios": scenarios, "strategies": strategies}


@router.post("/tax/relief")
def tax_relief(req: TaxReliefRequest, db: Session = Depends(get_db)):
    snap = db.scalars(
        select(PolicySnapshot)
        .where(PolicySnapshot.status == "active")
        .order_by(PolicySnapshot.effective_year.desc())
    ).first()
    if not snap:
        raise HTTPException(404, "No active policy snapshot")
    policy = snapshot_to_policy(snap)
    r = compute_relief(
        Decimal(str(req.income)), Decimal(str(req.rstu_self)),
        Decimal(str(req.rstu_family)), Decimal(str(req.voluntary_cpf)), policy,
        srs_contribution=Decimal(str(req.srs_contribution)),
        residency=req.residency,
    )
    return {
        "relief_earned": float(r["relief_earned"]),
        "remaining_cap": float(r["remaining_cap"]),
        "estimated_tax_saved": float(r["estimated_tax_saved"]),
        "marginal_rate": r["marginal_rate"],
        "srs_relief": float(r["srs_relief"]),
        "srs_remaining_cap": float(r["srs_remaining_cap"]),
        "total_relief": float(r["total_relief"]),
        "personal_cap_hit": r["personal_cap_hit"],
    }


def _srs_floats(r: dict) -> dict:
    return {
        "mode": r["mode"],
        "years": [
            {"year": y["year"], "draw": float(y["draw"]),
             "taxable": float(y["taxable"]), "tax": float(y["tax"])}
            for y in r["years"]
        ],
        "lifetime_tax": float(r["lifetime_tax"]),
        "penalty": float(r["penalty"]),
        "total_cost": float(r["total_cost"]),
        "effective_rate": r["effective_rate"],
    }


@router.post("/srs/withdrawal")
def srs_withdrawal(req: SrsWithdrawalRequest, db: Session = Depends(get_db)):
    snap = db.scalars(
        select(PolicySnapshot)
        .where(PolicySnapshot.status == "active")
        .order_by(PolicySnapshot.effective_year.desc())
    ).first()
    if not snap:
        raise HTTPException(404, "No active policy snapshot")
    policy = snapshot_to_policy(snap)
    bal = Decimal(str(req.balance))
    inc = Decimal(str(req.annual_income))
    spread = model_srs_withdrawal(bal, "spread_10y", policy, annual_income=inc)
    premature = model_srs_withdrawal(bal, "premature", policy, annual_income=inc)
    return {
        "spread_10y": _srs_floats(spread),
        "premature": _srs_floats(premature),
        # extra lifetime cost of cashing out early vs spreading
        "premature_extra_cost": float(premature["total_cost"] - spread["total_cost"]),
    }


@router.post("/tax/estimate")
def tax_estimate(req: TaxEstimateRequest, db: Session = Depends(get_db)):
    snap = db.scalars(
        select(PolicySnapshot)
        .where(PolicySnapshot.status == "active")
        .order_by(PolicySnapshot.effective_year.desc())
    ).first()
    if not snap:
        raise HTTPException(404, "No active policy snapshot")
    brackets = snapshot_to_policy(snap)["income_tax_brackets"]
    inc = Decimal(str(req.income))
    ded = Decimal(str(req.deduction))
    saved = income_tax(inc, brackets) - income_tax(max(inc - ded, Decimal("0")), brackets)
    return {
        "estimated_tax_saved": float(saved),
        "marginal_rate": float(marginal_rate(inc, brackets)),
    }
