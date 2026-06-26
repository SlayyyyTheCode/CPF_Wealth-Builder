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
    # tax residency: citizen | pr | foreigner. Drives the SRS contribution cap
    # ($15,300 citizen/PR vs $35,700 foreigner).
    residency: Mapped[str] = mapped_column(
        String(16), nullable=False, default="citizen", server_default="citizen"
    )
    balances: Mapped[dict] = mapped_column(JSON)  # {"OA":..,"SA":..,"MA":..,"RA":..}
    housing_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    voluntary_top_ups: Mapped[list | None] = mapped_column(JSON, nullable=True)
    # admin-granted access to the CPF Millionaire tab + self-edit of Settings
    special_access: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    # optional per-client password (bcrypt) — app-level gate to open the client
    password_hash: Mapped[str | None] = mapped_column(String(120), nullable=True)
    # projection inputs: yearly salary increment (fraction, e.g. 0.03) and annual
    # bonus expressed in months of salary.
    salary_increment_pct: Mapped[float] = mapped_column(
        Numeric(6, 4), nullable=False, default=0, server_default="0"
    )
    bonus_months: Mapped[float] = mapped_column(
        Numeric(5, 2), nullable=False, default=0, server_default="0"
    )

    @property
    def has_password(self) -> bool:
        return bool(self.password_hash)
