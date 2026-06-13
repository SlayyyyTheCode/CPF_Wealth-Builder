from datetime import datetime, UTC

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.policy import PolicySnapshot
from app.schemas.policy import (
    PolicySnapshotCreate,
    PolicySnapshotOut,
    IngestResponse,
    PolicySnapshotListItem,
)
from app.ai.extractor import get_extractor, ExtractionError, PolicyExtractor
from app.ai.diff import diff_policy, CORE_FIELDS
from app.core.config import settings
from app.core.security import require_admin

router = APIRouter(prefix="/policy", tags=["policy"])


def extractor_dep() -> PolicyExtractor:
    return get_extractor(settings)


CARRIED = [
    "contribution_rates",
    "allocation_rates",
    "interest_rates",
    "income_tax_brackets",
    "rstu_caps",
    "medishield_premiums",
    "assumptions",
]


@router.get("/snapshots", response_model=list[PolicySnapshotListItem])
def list_snapshots(db: Session = Depends(get_db)):
    return db.scalars(
        select(PolicySnapshot).order_by(PolicySnapshot.id.desc())
    ).all()


@router.post("/ingest", response_model=IngestResponse)
async def ingest(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    extractor: PolicyExtractor = Depends(extractor_dep),
    _: str = Depends(require_admin),
):
    data = await file.read()
    try:
        extracted = extractor.extract(data)
    except ExtractionError as exc:
        raise HTTPException(422, f"Extraction failed: {exc}")
    active = db.scalars(
        select(PolicySnapshot)
        .where(PolicySnapshot.status == "active")
        .order_by(PolicySnapshot.effective_year.desc())
    ).first()
    active_core, carried = {}, {}
    if active:
        active_core = {
            "effective_year": active.effective_year,
            "frs": float(active.frs),
            "brs": float(active.brs),
            "ers": float(active.ers),
            "bhs": float(active.bhs),
            "ordinary_wage_ceiling": float(active.ordinary_wage_ceiling),
            "additional_wage_ceiling": float(active.additional_wage_ceiling),
            "cpf_life_eligibility_min": float(active.cpf_life_eligibility_min),
        }
        carried = {k: getattr(active, k) for k in CARRIED}
    return {
        "extracted": extracted,
        "diff": diff_policy(extracted, active_core),
        "carried_forward": carried,
    }


@router.get("/active", response_model=PolicySnapshotOut)
def get_active(year: int, db: Session = Depends(get_db)):
    snap = db.scalars(
        select(PolicySnapshot).where(
            PolicySnapshot.effective_year == year,
            PolicySnapshot.status == "active",
        )
    ).first()
    if not snap:
        raise HTTPException(404, f"No active policy for {year}")
    return snap


@router.post(
    "/snapshots",
    response_model=PolicySnapshotOut,
    status_code=status.HTTP_201_CREATED,
)
def create_snapshot(payload: PolicySnapshotCreate, db: Session = Depends(get_db), _: str = Depends(require_admin)):
    snap = PolicySnapshot(**payload.model_dump(), status="draft")
    db.add(snap)
    db.commit()
    db.refresh(snap)
    return snap


@router.post("/snapshots/{snap_id}/approve", response_model=PolicySnapshotOut)
def approve(snap_id: int, db: Session = Depends(get_db), _: str = Depends(require_admin)):
    snap = db.get(PolicySnapshot, snap_id)
    if not snap:
        raise HTTPException(404, "Snapshot not found")
    # archive any currently-active snapshot for the same year
    for other in db.scalars(
        select(PolicySnapshot).where(
            PolicySnapshot.effective_year == snap.effective_year,
            PolicySnapshot.status == "active",
            PolicySnapshot.id != snap.id,
        )
    ).all():
        other.status = "archived"
    snap.status = "active"
    snap.approved_at = datetime.now(UTC)
    snap.approved_by = "admin"
    db.commit()
    db.refresh(snap)
    return snap
