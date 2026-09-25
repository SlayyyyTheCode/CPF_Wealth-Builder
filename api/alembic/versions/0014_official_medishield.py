"""replace the estimated MediShield Life premium table with CPF's official one

The seeded table was a "best-known estimate" that was wrong in every band except
the first. Replaced with CPF's official Table B (before subsidies, GST-inclusive,
renewals on/after 1 Apr 2025), fetched and text-extracted 2026-09-25 from
cpf.gov.sg/content/dam/web/member/healthcare/documents/MediShield Life Premium Table.pdf.

Only SEED-ORIGINATED snapshots are touched (approved_by 'seed' or 'seed-2027').
A snapshot an administrator approved by hand is never overwritten.

Literal values are frozen here (a migration must not change meaning if an app
constant is later edited).

Revision ID: 0014_official_medishield
Revises: 0013_seed_2027
Create Date: 2026-09-25
"""
from alembic import op
import sqlalchemy as sa

revision = "0014_official_medishield"
down_revision = "0013_seed_2027"
branch_labels = None
depends_on = None

SEED_TAGS = ("seed", "seed-2027")

OFFICIAL = [
    {"max_age": 20, "annual": 200}, {"max_age": 30, "annual": 295},
    {"max_age": 40, "annual": 503}, {"max_age": 50, "annual": 637},
    {"max_age": 60, "annual": 903}, {"max_age": 65, "annual": 1131},
    {"max_age": 70, "annual": 1326}, {"max_age": 73, "annual": 1643},
    {"max_age": 75, "annual": 1816}, {"max_age": 78, "annual": 2027},
    {"max_age": 80, "annual": 2187}, {"max_age": 83, "annual": 2303},
    {"max_age": 85, "annual": 2616}, {"max_age": 88, "annual": 2785},
    {"max_age": 90, "annual": 2785}, {"max_age": None, "annual": 2826},
]

# The estimate it replaces (restored on downgrade).
PREVIOUS = [
    {"max_age": 20, "annual": 200}, {"max_age": 40, "annual": 435},
    {"max_age": 50, "annual": 630}, {"max_age": 60, "annual": 870},
    {"max_age": 65, "annual": 1085}, {"max_age": 70, "annual": 1250},
    {"max_age": 75, "annual": 1630}, {"max_age": 80, "annual": 1975},
    {"max_age": 85, "annual": 2330}, {"max_age": 90, "annual": 2510},
    {"max_age": None, "annual": 2620},
]


def _set(table_value) -> None:
    bind = op.get_bind()
    t = sa.Table("policy_snapshots", sa.MetaData(), autoload_with=bind)
    bind.execute(
        t.update()
        .where(t.c.approved_by.in_(SEED_TAGS))
        .values(medishield_premiums=table_value)
    )


def upgrade() -> None:
    _set(OFFICIAL)


def downgrade() -> None:
    _set(PREVIOUS)
