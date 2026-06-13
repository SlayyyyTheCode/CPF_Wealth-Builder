from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.member import MemberProfile
from app.models.simulation import SimulationRun
from app.schemas.member import MemberCreate, MemberOut, MemberSummaryOut, MemberUpdate
from app.core.security import require_admin

router = APIRouter(prefix="/members", tags=["members"])


@router.get("", response_model=list[MemberSummaryOut])
def list_members(db: Session = Depends(get_db)):
    members = db.scalars(select(MemberProfile).order_by(MemberProfile.id)).all()
    out = []
    for m in members:
        bal = m.balances or {}
        current_total = float(sum(bal.get(k, 0) for k in ("OA", "SA", "MA", "RA")))
        run = db.scalars(
            select(SimulationRun)
            .where(SimulationRun.member_id == m.id)
            .order_by(SimulationRun.id.desc())
        ).first()
        latest = None
        if run:
            r = run.result or {}
            cpf = r.get("cpf_life") or {}
            latest = {
                "readiness": r.get("readiness"),
                "total_at_payout": r.get("ra_at_payout"),
                "cpf_life_monthly": cpf.get("monthly_payout"),
            }
        out.append({
            "id": m.id, "name": m.name, "dob": m.dob,
            "employment_status": m.employment_status,
            "current_total": current_total, "latest_run": latest,
        })
    return out


@router.post("", response_model=MemberOut, status_code=status.HTTP_201_CREATED)
def create_member(payload: MemberCreate, db: Session = Depends(get_db), _: str = Depends(require_admin)):
    data = payload.model_dump()
    data["balances"] = payload.balances.model_dump()
    m = MemberProfile(**data)
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


@router.get("/{member_id}", response_model=MemberOut)
def get_member(member_id: int, db: Session = Depends(get_db)):
    m = db.get(MemberProfile, member_id)
    if not m:
        raise HTTPException(404, "Member not found")
    return m


@router.delete("/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_member(member_id: int, db: Session = Depends(get_db), _: str = Depends(require_admin)):
    m = db.get(MemberProfile, member_id)
    if not m:
        raise HTTPException(404, "Member not found")
    # remove dependent simulation runs first (no DB-level cascade)
    runs = db.scalars(
        select(SimulationRun).where(SimulationRun.member_id == member_id)
    ).all()
    for r in runs:
        db.delete(r)
    db.delete(m)
    db.commit()


@router.put("/{member_id}", response_model=MemberOut)
def update_member(member_id: int, payload: MemberUpdate, db: Session = Depends(get_db), _: str = Depends(require_admin)):
    m = db.get(MemberProfile, member_id)
    if not m:
        raise HTTPException(404, "Member not found")
    data = payload.model_dump(exclude_unset=True)
    if "balances" in data and data["balances"] is not None:
        m.balances = data.pop("balances")
    else:
        data.pop("balances", None)
    for k, v in data.items():
        setattr(m, k, v)
    db.commit()
    db.refresh(m)
    return m
