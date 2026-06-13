from datetime import datetime

from pydantic import BaseModel, ConfigDict


class SimulateRequest(BaseModel):
    end_age: int
    retirement_sum_target: str = "FRS"
    annual_bonus: float = 0
    cpf_life_plan: str = "Standard"
    payout_age: int = 65
    apply_growth: bool = True
    growth_sum_rate: float | None = None
    growth_bhs_rate: float | None = None
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
