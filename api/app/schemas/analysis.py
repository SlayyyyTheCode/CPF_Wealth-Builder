from pydantic import BaseModel


class AnalysisRequest(BaseModel):
    annual_assessable_income: float = 0
    property_pledge_eligible: bool = False
    cpf_life_plan: str = "Standard"
    payout_age: int = 65
    end_age: int = 90
    retirement_sum_target: str = "FRS"
    apply_growth: bool = True
    growth_sum_rate: float | None = None
    growth_bhs_rate: float | None = None


class AnalysisResponse(BaseModel):
    scenarios: dict
    strategies: list[dict]


class TaxReliefRequest(BaseModel):
    income: float
    rstu_self: float = 0
    rstu_family: float = 0
    voluntary_cpf: float = 0
    srs_contribution: float = 0
    residency: str = "citizen"  # citizen | pr | foreigner


class TaxEstimateRequest(BaseModel):
    income: float
    deduction: float = 0


class SrsWithdrawalRequest(BaseModel):
    balance: float
    annual_income: float = 0  # other chargeable income during withdrawal years
