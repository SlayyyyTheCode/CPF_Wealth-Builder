from datetime import date

from pydantic import BaseModel, ConfigDict


class Balances(BaseModel):
    OA: float = 0
    SA: float = 0
    MA: float = 0
    RA: float = 0


class MemberCreate(BaseModel):
    name: str
    dob: date
    monthly_gross_wage: float
    employment_status: str = "employee"
    balances: Balances = Balances()
    housing_data: dict | None = None
    voluntary_top_ups: list | None = None


class MemberOut(MemberCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int


class MemberUpdate(BaseModel):
    name: str | None = None
    dob: date | None = None
    monthly_gross_wage: float | None = None
    employment_status: str | None = None
    balances: Balances | None = None


class MemberSummaryOut(BaseModel):
    id: int
    name: str
    dob: date
    employment_status: str
    current_total: float
    latest_run: dict | None
