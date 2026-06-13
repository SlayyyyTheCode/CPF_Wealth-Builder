from datetime import datetime

from sqlalchemy import String, Integer, Numeric, JSON, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class SimulationRun(Base):
    __tablename__ = "simulation_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("member_profiles.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    end_age: Mapped[int] = mapped_column(Integer)
    retirement_sum_target: Mapped[str] = mapped_column(String(8), default="FRS")
    annual_bonus: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    policy_snapshot_id: Mapped[int | None] = mapped_column(
        ForeignKey("policy_snapshots.id"), nullable=True
    )
    result: Mapped[dict] = mapped_column(JSON)
