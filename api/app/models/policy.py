from datetime import datetime

from sqlalchemy import String, Integer, Numeric, JSON, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PolicySnapshot(Base):
    __tablename__ = "policy_snapshots"

    id: Mapped[int] = mapped_column(primary_key=True)
    effective_year: Mapped[int] = mapped_column(Integer, index=True)
    status: Mapped[str] = mapped_column(String(16), default="draft")  # draft|active|archived
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    approved_by: Mapped[str | None] = mapped_column(String(120), nullable=True)

    frs: Mapped[float] = mapped_column(Numeric(12, 2))
    brs: Mapped[float] = mapped_column(Numeric(12, 2))
    ers: Mapped[float] = mapped_column(Numeric(12, 2))
    bhs: Mapped[float] = mapped_column(Numeric(12, 2))
    cpf_life_eligibility_min: Mapped[float] = mapped_column(Numeric(12, 2))
    ordinary_wage_ceiling: Mapped[float] = mapped_column(Numeric(12, 2))
    additional_wage_ceiling: Mapped[float] = mapped_column(Numeric(12, 2))

    contribution_rates: Mapped[dict] = mapped_column(JSON)
    allocation_rates: Mapped[dict] = mapped_column(JSON)
    interest_rates: Mapped[dict] = mapped_column(JSON)
    income_tax_brackets: Mapped[list | None] = mapped_column(JSON, nullable=True)
    rstu_caps: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    srs: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    medishield_premiums: Mapped[list | None] = mapped_column(JSON, nullable=True)
    assumptions: Mapped[dict | None] = mapped_column(JSON, nullable=True)
