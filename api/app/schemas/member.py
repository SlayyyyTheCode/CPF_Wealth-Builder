from datetime import date

from pydantic import BaseModel, ConfigDict, Field

# Sanity caps for user input: generous vs any real CPF figure, tight enough to
# stop negative/overflow garbage from reaching the simulation engines.
_MONEY_CAP = 100_000_000
_WAGE_CAP = 1_000_000  # monthly SGD


class Balances(BaseModel):
    OA: float = Field(default=0, ge=0, le=_MONEY_CAP)
    SA: float = Field(default=0, ge=0, le=_MONEY_CAP)
    MA: float = Field(default=0, ge=0, le=_MONEY_CAP)
    RA: float = Field(default=0, ge=0, le=_MONEY_CAP)


class MemberCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    dob: date
    monthly_gross_wage: float = Field(ge=0, le=_WAGE_CAP)
    employment_status: str = "employee"
    residency: str = "citizen"  # citizen | pr | foreigner
    balances: Balances = Balances()
    housing_data: dict | None = None
    voluntary_top_ups: list | None = None
    special_access: bool = False
    # yearly raise as a fraction (0.03 = 3%); 1.0 (+100%/yr) is the sanity roof
    salary_increment_pct: float = Field(default=0, ge=0, le=1)
    bonus_months: float = Field(default=0, ge=0, le=24)  # annual bonus in months of salary
    password: str | None = None  # optional per-client password (input only)


class MemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    dob: date
    monthly_gross_wage: float
    employment_status: str = "employee"
    residency: str = "citizen"
    balances: Balances = Balances()
    housing_data: dict | None = None
    voluntary_top_ups: list | None = None
    special_access: bool = False
    salary_increment_pct: float = 0
    bonus_months: float = 0
    has_password: bool = False  # never expose the hash


class MemberUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    dob: date | None = None
    monthly_gross_wage: float | None = Field(default=None, ge=0, le=_WAGE_CAP)
    employment_status: str | None = None
    residency: str | None = None
    balances: Balances | None = None
    housing_data: dict | None = None
    special_access: bool | None = None
    salary_increment_pct: float | None = Field(default=None, ge=0, le=1)
    bonus_months: float | None = Field(default=None, ge=0, le=24)
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
