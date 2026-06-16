from datetime import date

from sqlalchemy import String, Date, Numeric, JSON, Boolean
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class MemberProfile(Base):
    __tablename__ = "member_profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    dob: Mapped[date] = mapped_column(Date)
    monthly_gross_wage: Mapped[float] = mapped_column(Numeric(12, 2))
    employment_status: Mapped[str] = mapped_column(String(20), default="employee")
    balances: Mapped[dict] = mapped_column(JSON)  # {"OA":..,"SA":..,"MA":..,"RA":..}
    housing_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    voluntary_top_ups: Mapped[list | None] = mapped_column(JSON, nullable=True)
    # admin-granted access to the CPF Millionaire tab + self-edit of Settings
    special_access: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    # optional per-client password (bcrypt) — app-level gate to open the client
    password_hash: Mapped[str | None] = mapped_column(String(120), nullable=True)

    @property
    def has_password(self) -> bool:
        return bool(self.password_hash)
