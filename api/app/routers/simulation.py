from datetime import date, datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.member import MemberProfile
from app.models.policy import PolicySnapshot
from app.models.simulation import SimulationRun
from app.engines.domain import AccountState, SimulationInput, SelfEmployedNotSupported
from app.engines.policy_resolver import make_db_resolver, GrowthAssumptions
from app.engines.serialize import serialize_result
from app.engines.milestones import compute_milestones
from app.engines.simulation import run_simulation
from app.policy.medishield import premium_for_age
from app.schemas.simulation import (
    SimulateRequest, SimulationRunOut, SimulationRunSummary,
)

router = APIRouter(tags=["simulation"])


def _medisave_from(res, resolve):
    series = []
    premiums = []
    for y in res.years:
        p = resolve(y.year)
        series.append({"age": y.age, "ma": float(y.closing.MA), "bhs": float(p["bhs"])})
        if y.age <= 85:
            premiums.append({"age": y.age, "annual": float(premium_for_age(y.age, p["medishield_premiums"]))})
    at85 = next((y for y in res.years if y.age == 85), None)
    if at85 is None:
        at85 = next((y for y in reversed(res.years) if y.age < 85), None)
    if at85 is not None:
        p85 = resolve(at85.year)
        ma_at_85 = float(at85.closing.MA)
        premium_at_85 = float(premium_for_age(85, p85["medishield_premiums"]))
        surplus = ma_at_85 - premium_at_85
        return {"series": series, "premiums": premiums, "ma_at_85": ma_at_85,
                "premium_at_85": premium_at_85, "surplus_at_85": surplus, "adequate": surplus >= 0}
    return {"series": series, "premiums": premiums, "ma_at_85": None,
            "premium_at_85": None, "surplus_at_85": None, "adequate": None}


def _readiness_from(res, dob, resolve):
    from decimal import Decimal
    from app.engines.readiness import compute_readiness
    ra_at_55 = next(
        (Decimal(str(e.detail["ra_formed"])) for e in res.events if e.kind == "RA_FORMED"),
        None,
    )
    if ra_at_55 is None:
        return None
    ma_at_55 = next(
        (m.closing.MA for m in res.months if m.age == 55 and m.month == dob.month),
        None,
    )
    if ma_at_55 is None:
        return None
    policy55 = resolve(dob.year + 55)
    a = policy55.get("assumptions", {})
    return compute_readiness(
        ra_at_55, policy55["frs"], ma_at_55, policy55["bhs"],
        weights=a.get("readiness"),
        bands=a.get("readiness"),
    )


def _balances_to_state(balances: dict) -> AccountState:
    return AccountState(
        OA=Decimal(str(balances.get("OA", 0))),
        SA=Decimal(str(balances.get("SA", 0))),
        MA=Decimal(str(balances.get("MA", 0))),
        RA=Decimal(str(balances.get("RA", 0))),
    )


@router.post(
    "/members/{member_id}/simulate",
    response_model=SimulationRunOut,
    status_code=status.HTTP_200_OK,
)
def simulate(member_id: int, req: SimulateRequest, response: Response, db: Session = Depends(get_db)):
    member = db.get(MemberProfile, member_id)
    if not member:
        raise HTTPException(404, "Member not found")

    start_year = date.today().year

    # Use override balances if provided, else use member's stored balances
    opening_state = (
        _balances_to_state(req.override_balances)
        if req.override_balances is not None
        else _balances_to_state(member.balances)
    )

    inp = SimulationInput(
        opening=opening_state,
        dob=member.dob,
        monthly_gross_wage=Decimal(str(member.monthly_gross_wage)),
        employment_status=member.employment_status,
        end_age=req.end_age,
        start_year=start_year,
        retirement_sum_target=req.retirement_sum_target,
        annual_bonus=Decimal(str(req.annual_bonus)),
        cpf_life_plan=req.cpf_life_plan,
        payout_age=req.payout_age,
        salary_increment=Decimal(str(getattr(member, "salary_increment_pct", 0) or 0)),
        bonus_months=Decimal(str(getattr(member, "bonus_months", 0) or 0)),
    )

    # Resolve growth rates: use request values when provided, else fall back to
    # the active policy's editable assumptions.
    if req.apply_growth:
        _assumptions_resolve = make_db_resolver(db, None)
        g = _assumptions_resolve(start_year).get("assumptions", {}).get("growth", {})
        sum_rate = req.growth_sum_rate if req.growth_sum_rate is not None else g.get("sum_rate", 0.035)
        bhs_rate = req.growth_bhs_rate if req.growth_bhs_rate is not None else g.get("bhs_rate", 0.045)
        growth = GrowthAssumptions(
            sum_rate=Decimal(str(sum_rate)),
            bhs_rate=Decimal(str(bhs_rate)),
        )
    else:
        growth = None

    resolve = make_db_resolver(db, growth)
    try:
        res = run_simulation(inp, resolve)
    except SelfEmployedNotSupported as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc))

    result_payload = serialize_result(res)
    result_payload["readiness"] = _readiness_from(res, member.dob, resolve)
    result_payload["milestones"] = compute_milestones(res, member.dob, resolve)
    result_payload["medisave"] = _medisave_from(res, resolve)

    # Persist only when no override_balances override is active
    do_persist = req.persist and req.override_balances is None

    if not do_persist:
        # Read-only dashboard path: the web client never reads the per-month
        # series (only years[]). Drop it to shrink the wire payload ~50% — faster
        # transfer + JSON parse on first load. Persisted runs keep months.
        read_payload = {k: v for k, v in result_payload.items() if k != "months"}
        return {
            "id": 0,
            "member_id": member_id,
            "created_at": datetime.now(timezone.utc),
            "end_age": req.end_age,
            "retirement_sum_target": req.retirement_sum_target,
            "annual_bonus": req.annual_bonus,
            "policy_snapshot_id": None,
            "result": read_payload,
        }

    snap = db.scalars(
        select(PolicySnapshot).where(
            PolicySnapshot.effective_year == start_year,
            PolicySnapshot.status == "active",
        )
    ).first()

    run = SimulationRun(
        member_id=member_id,
        end_age=req.end_age,
        retirement_sum_target=req.retirement_sum_target,
        annual_bonus=req.annual_bonus,
        policy_snapshot_id=snap.id if snap else None,
        result=result_payload,
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    response.status_code = status.HTTP_201_CREATED
    return run


@router.get("/members/{member_id}/simulations", response_model=list[SimulationRunSummary])
def list_runs(member_id: int, db: Session = Depends(get_db)):
    runs = db.scalars(
        select(SimulationRun)
        .where(SimulationRun.member_id == member_id)
        .order_by(SimulationRun.id)
    ).all()
    return [
        SimulationRunSummary(
            id=r.id, member_id=r.member_id, created_at=r.created_at,
            end_age=r.end_age, retirement_sum_target=r.retirement_sum_target,
            final=r.result.get("final", {}),
        )
        for r in runs
    ]


@router.get("/simulations/{run_id}", response_model=SimulationRunOut)
def get_run(run_id: int, db: Session = Depends(get_db)):
    run = db.get(SimulationRun, run_id)
    if not run:
        raise HTTPException(404, "Simulation run not found")
    return run
