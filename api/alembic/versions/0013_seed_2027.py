"""seed 2027 policy snapshot (senior-worker step-up + 2027 retirement sums)

Adds an ACTIVE policy snapshot for effective_year 2027 so projections apply
CPF's 1 January 2027 rules from that year on. It is built by COPYING the active
2026 snapshot (interest, tax, RSTU, SRS, MediShield, assumptions and every other
unchanged field carry forward) and overriding only what CPF changed.

Verified 2026-09-25 against CPF's own published pages/PDFs:
  * ERS 2027 = 456,400; FRS = ERS/2 = 228,200; BRS = FRS/2 = 114,100
  * Contribution 55-60: 34% -> 35.5%; 60-65: 25% -> 26%
  * Allocation 55-60 / 60-65 ratios (the whole increase goes to the RA)
  * Ordinary Wage ceiling stays 8,000

BHS 2027 is NOT yet announced by CPF; 82,555 is the growth-assumption estimate
(79,000 x 1.045) — identical to what the engine already projected for 2027 — and
must be replaced with the official figure once published.

The literal values below are deliberately frozen here rather than imported from
app.policy.*: a migration must not change meaning if a constant is later edited.

Idempotent: does nothing if an active 2027 snapshot already exists (e.g. one an
admin approved by hand) or if there is no active 2026 snapshot to copy from.

Revision ID: 0013_seed_2027
Revises: 0012_password_attempts
Create Date: 2026-09-25
"""
import copy
from datetime import datetime, UTC

from alembic import op
import sqlalchemy as sa

revision = "0013_seed_2027"
down_revision = "0012_password_attempts"
branch_labels = None
depends_on = None

SEED_TAG = "seed-2027"

OVERRIDES = {
    "effective_year": 2027,
    "status": "active",
    "frs": 228200,
    "brs": 114100,
    "ers": 456400,
    "bhs": 82555,  # ESTIMATE until CPF announces the official 2027 BHS
}

CONTRIBUTION_OVERRIDE = {"55-60": 0.355, "60-65": 0.26}

ALLOCATION_OVERRIDE = {
    "55-60": {"OA": 0.3382, "SAorRA": 0.3661, "MA": 0.2957},
    "60-65": {"OA": 0.1347, "SAorRA": 0.4615, "MA": 0.4038},
}


def upgrade() -> None:
    bind = op.get_bind()
    t = sa.Table("policy_snapshots", sa.MetaData(), autoload_with=bind)

    already = bind.execute(
        sa.select(t.c.id).where(t.c.effective_year == 2027, t.c.status == "active")
    ).first()
    if already is not None:
        return

    base = bind.execute(
        sa.select(t)
        .where(t.c.effective_year == 2026, t.c.status == "active")
        .order_by(t.c.id.desc())
    ).mappings().first()
    if base is None:
        return

    row = {c.name: base[c.name] for c in t.columns if c.name not in ("id", "created_at")}
    row.update(OVERRIDES)

    contribution = copy.deepcopy(row["contribution_rates"])
    contribution.update(CONTRIBUTION_OVERRIDE)
    allocation = copy.deepcopy(row["allocation_rates"])
    allocation.update(copy.deepcopy(ALLOCATION_OVERRIDE))
    row["contribution_rates"] = contribution
    row["allocation_rates"] = allocation

    row["approved_at"] = datetime.now(UTC).replace(tzinfo=None)
    row["approved_by"] = SEED_TAG
    bind.execute(t.insert().values(**row))


def downgrade() -> None:
    op.execute(
        f"DELETE FROM policy_snapshots WHERE effective_year = 2027 "
        f"AND approved_by = '{SEED_TAG}'"
    )
