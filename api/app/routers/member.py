from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, delete, func
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.member import MemberProfile
from app.models.simulation import SimulationRun
from app.models.auth_attempt import PasswordAttempt
from app.schemas.member import (
    MemberCreate, MemberOut, MemberSummaryOut, MemberUpdate, PasswordVerify,
)
from app.core.security import (
    require_admin, optional_admin, require_member_access,
    hash_password, verify_password, create_member_token,
)

router = APIRouter(prefix="/members", tags=["members"])

# ── brute-force throttle for password verification ───────────────────────────
# Sliding window per member: after MAX_FAILS failed attempts within
# WINDOW_SECS, further attempts get 429 until the window slides past.
#
# Backed by the `password_attempts` table, NOT process memory. The API runs on
# Vercel serverless, where each request may hit a different short-lived
# container; an in-process counter resets with the container, handing an
# attacker a fresh allowance every time one spins up. The database is the only
# counter all instances share.
_PW_MAX_FAILS = 5
_PW_WINDOW_SECS = 15 * 60


def _pw_window_start() -> datetime:
    # server_default=func.now() writes naive UTC; compare naive-to-naive.
    return datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(seconds=_PW_WINDOW_SECS)


def _pw_throttled(db: Session, member_id: int) -> bool:
    cutoff = _pw_window_start()
    # Prune expired rows for this member, then count what's left in-window.
    db.execute(
        delete(PasswordAttempt).where(
            PasswordAttempt.member_id == member_id,
            PasswordAttempt.created_at < cutoff,
        )
    )
    db.commit()
    n = db.scalar(
        select(func.count())
        .select_from(PasswordAttempt)
        .where(
            PasswordAttempt.member_id == member_id,
            PasswordAttempt.created_at >= cutoff,
        )
    )
    return (n or 0) >= _PW_MAX_FAILS


def _pw_record_fail(db: Session, member_id: int) -> None:
    db.add(PasswordAttempt(member_id=member_id))
    db.commit()


def _pw_clear(db: Session, member_id: int) -> None:
    db.execute(delete(PasswordAttempt).where(PasswordAttempt.member_id == member_id))
    db.commit()


@router.get("", response_model=list[MemberSummaryOut])
def list_members(db: Session = Depends(get_db), is_admin: bool = Depends(optional_admin)):
    members = db.scalars(select(MemberProfile).order_by(MemberProfile.id)).all()
    out = []
    for m in members:
        # Don't leak a protected client's balances/projection in the roster to
        # non-admins — the card shows a locked state from has_password.
        masked = bool(m.password_hash) and not is_admin
        bal = m.balances or {}
        current_total = 0.0 if masked else float(sum(bal.get(k, 0) for k in ("OA", "SA", "MA", "RA")))
        latest = None
        if not masked:
            run = db.scalars(
                select(SimulationRun)
                .where(SimulationRun.member_id == m.id)
                .order_by(SimulationRun.id.desc())
            ).first()
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
            "has_password": m.has_password,
        })
    return out


@router.post("", response_model=MemberOut, status_code=status.HTTP_201_CREATED)
def create_member(payload: MemberCreate, db: Session = Depends(get_db)):
    # Any user may create their own client profile (no admin required).
    data = payload.model_dump()
    data["balances"] = payload.balances.model_dump()
    pw = data.pop("password", None)
    m = MemberProfile(**data)
    if pw:
        m.password_hash = hash_password(pw)
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


@router.post("/{member_id}/verify-password")
def verify_member_password(member_id: int, payload: PasswordVerify, db: Session = Depends(get_db)):
    m = db.get(MemberProfile, member_id)
    if not m:
        raise HTTPException(404, "Member not found")
    if not m.password_hash:
        return {"ok": True, "token": None}  # no password set → open
    if _pw_throttled(db, member_id):
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Too many failed attempts — try again in a few minutes.",
        )
    ok = verify_password(payload.password, m.password_hash)
    if ok:
        _pw_clear(db, member_id)
    else:
        _pw_record_fail(db, member_id)
    # Issue a member-scoped access token only on success.
    return {"ok": ok, "token": create_member_token(member_id) if ok else None}


@router.get("/{member_id}", response_model=MemberOut)
def get_member(
    member_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(require_member_access),
):
    m = db.get(MemberProfile, member_id)
    if not m:
        raise HTTPException(404, "Member not found")
    return m


@router.delete("/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_member(member_id: int, db: Session = Depends(get_db), _: str = Depends(require_admin)):
    m = db.get(MemberProfile, member_id)
    if not m:
        raise HTTPException(404, "Member not found")
    # remove dependent rows first (SQLite doesn't enforce ON DELETE CASCADE
    # unless PRAGMA foreign_keys is on, so don't rely on it)
    runs = db.scalars(
        select(SimulationRun).where(SimulationRun.member_id == member_id)
    ).all()
    for r in runs:
        db.delete(r)
    db.execute(delete(PasswordAttempt).where(PasswordAttempt.member_id == member_id))
    db.delete(m)
    db.commit()


@router.put("/{member_id}", response_model=MemberOut)
def update_member(
    member_id: int,
    payload: MemberUpdate,
    db: Session = Depends(get_db),
    is_admin: bool = Depends(optional_admin),
    _: None = Depends(require_member_access),
):
    m = db.get(MemberProfile, member_id)
    if not m:
        raise HTTPException(404, "Member not found")
    # Any user may edit their own client's values via Settings. Only the admin
    # may grant/revoke CPF Millionaire access (special_access).
    data = payload.model_dump(exclude_unset=True)
    if not is_admin:
        data.pop("special_access", None)
    # Optional per-client password set/replace (hash it; never store plaintext).
    # A reset also clears the brute-force throttle window, so a member the
    # admin just helped can sign in with the new password immediately instead
    # of waiting out the 15-minute lockout.
    pw = data.pop("password", None)
    if pw is not None:
        m.password_hash = hash_password(pw) if pw else None
        _pw_clear(db, member_id)
    if "balances" in data and data["balances"] is not None:
        m.balances = data.pop("balances")
    else:
        data.pop("balances", None)
    for k, v in data.items():
        setattr(m, k, v)
    db.commit()
    db.refresh(m)
    return m
