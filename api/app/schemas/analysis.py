from pydantic import BaseModel, Field

# Money fields are capped at S$100M — far above any real CPF figure, low
# enough to stop float-overflow garbage from reaching the engines.
_MONEY_CAP = 100_000_000


class AnalysisRequest(BaseModel):
    annual_assessable_income: float = Field(default=0, ge=0, le=_MONEY_CAP)
    property_pledge_eligible: bool = False
    cpf_life_plan: str = "Standard"
    payout_age: int = Field(default=65, ge=55, le=90)
    end_age: int = Field(default=90, ge=1, le=120)
    retirement_sum_target: str = "FRS"
    apply_growth: bool = True
    growth_sum_rate: float | None = Field(default=None, ge=0, le=1)
    growth_bhs_rate: float | None = Field(default=None, ge=0, le=1)


class AnalysisResponse(BaseModel):
    scenarios: dict
    strategies: list[dict]


class TaxReliefRequest(BaseModel):
    income: float = Field(ge=0, le=_MONEY_CAP)
    rstu_self: float = Field(default=0, ge=0, le=_MONEY_CAP)
    rstu_family: float = Field(default=0, ge=0, le=_MONEY_CAP)
    voluntary_cpf: float = Field(default=0, ge=0, le=_MONEY_CAP)
    srs_contribution: float = Field(default=0, ge=0, le=_MONEY_CAP)
    residency: str = "citizen"  # citizen | pr | foreigner


class TaxEstimateRequest(BaseModel):
    income: float = Field(ge=0, le=_MONEY_CAP)
    deduction: float = Field(default=0, ge=0, le=_MONEY_CAP)


class SrsWithdrawalRequest(BaseModel):
    balance: float = Field(ge=0, le=_MONEY_CAP)
    annual_income: float = Field(default=0, ge=0, le=_MONEY_CAP)  # other chargeable income during withdrawal years
