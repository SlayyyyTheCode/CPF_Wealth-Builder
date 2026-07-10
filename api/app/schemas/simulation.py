from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class SimulateRequest(BaseModel):
    # end_age is bounded because the simulation is a monthly loop: an unbounded
    # value (e.g. 100000) meant ~1.2M Decimal iterations per request — a CPU
    # denial-of-service lever on a shared instance. 120 covers any human span.
    end_age: int = Field(ge=1, le=120)
    retirement_sum_target: str = "FRS"
    annual_bonus: float = Field(default=0, ge=0, le=10_000_000)
    cpf_life_plan: str = "Standard"
    payout_age: int = Field(default=65, ge=55, le=90)
    apply_growth: bool = True
    growth_sum_rate: float | None = Field(default=None, ge=0, le=1)
    growth_bhs_rate: float | None = Field(default=None, ge=0, le=1)
    override_balances: dict | None = None
    persist: bool = True


class SimulationRunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    member_id: int
    created_at: datetime
    end_age: int
    retirement_sum_target: str
    annual_bonus: float
    policy_snapshot_id: int | None
    result: dict


class SimulationRunSummary(BaseModel):
    id: int
    member_id: int
    created_at: datetime
    end_age: int
    retirement_sum_target: str
    final: dict
