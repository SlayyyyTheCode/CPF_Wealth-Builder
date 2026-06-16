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
    special_access: bool = False
    password: str | None = None  # optional per-client password (input only)


class MemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    dob: date
    monthly_gross_wage: float
    employment_status: str = "employee"
    balances: Balances = Balances()
    housing_data: dict | None = None
    voluntary_top_ups: list | None = None
    special_access: bool = False
    has_password: bool = False  # never expose the hash


class MemberUpdate(BaseModel):
    name: str | None = None
    dob: date | None = None
    monthly_gross_wage: float | None = None
    employment_status: str | None = None
    balances: Balances | None = None
    housing_data: dict | None = None
    special_access: bool | None = None
    password: str | None = None  # set/replace per-client password


class PasswordVerify(BaseModel):
    password: str


class MemberSummaryOut(BaseModel):
    id: int
    name: str
    dob: date
    employment_status: str
    current_total: float
    latest_run: dict | None
    has_password: bool = False
