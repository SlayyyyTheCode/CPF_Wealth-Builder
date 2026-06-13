from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal


class SelfEmployedNotSupported(Exception):
    """Raised when a self-employed member is passed to the employee-only engine."""


@dataclass(frozen=True)
class AccountState:
    OA: Decimal = Decimal("0")
    SA: Decimal = Decimal("0")
    MA: Decimal = Decimal("0")
    RA: Decimal = Decimal("0")


@dataclass(frozen=True)
class Event:
    kind: str          # RA_FORMED | SA_CLOSED | MA_OVERFLOW | INTEREST_CREDITED
    year: int
    month: int         # 1-12
    detail: dict


@dataclass(frozen=True)
class MonthState:
    year: int
    month: int
    age: int
    opening: AccountState
    closing: AccountState


@dataclass(frozen=True)
class YearResult:
    year: int
    age: int
    opening: AccountState
    closing: AccountState
    total_contributions: Decimal
    interest_base: Decimal
    interest_extra: Decimal
    interest_by_account: dict = field(default_factory=dict)
    overflow_out: dict = field(default_factory=dict)


@dataclass(frozen=True)
class SimulationInput:
    opening: AccountState
    dob: date
    monthly_gross_wage: Decimal
    employment_status: str
    end_age: int
    start_year: int
    retirement_sum_target: str = "FRS"   # BRS | FRS | ERS
    annual_bonus: Decimal = Decimal("0")
    cpf_life_plan: str = "Standard"      # Standard | Escalating | Basic
    payout_age: int = 65                 # 65-70


@dataclass(frozen=True)
class SimulationResult:
    years: list[YearResult] = field(default_factory=list)
    months: list[MonthState] = field(default_factory=list)
    events: list[Event] = field(default_factory=list)
    final: AccountState = field(default_factory=AccountState)
    cpf_life: dict = field(default_factory=dict)
    ra_at_payout: Decimal | None = None
