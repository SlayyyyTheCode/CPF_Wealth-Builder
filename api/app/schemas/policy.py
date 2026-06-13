from datetime import datetime

from pydantic import BaseModel, ConfigDict


class PolicySnapshotBase(BaseModel):
    effective_year: int
    frs: float
    brs: float
    ers: float
    bhs: float
    cpf_life_eligibility_min: float
    ordinary_wage_ceiling: float
    additional_wage_ceiling: float
    contribution_rates: dict
    allocation_rates: dict
    interest_rates: dict
    income_tax_brackets: list | None = None
    rstu_caps: dict | None = None
    medishield_premiums: list | None = None
    assumptions: dict | None = None


class PolicySnapshotCreate(PolicySnapshotBase):
    pass


class PolicySnapshotOut(PolicySnapshotBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    status: str
    created_at: datetime
    approved_at: datetime | None
    approved_by: str | None


class IngestResponse(BaseModel):
    extracted: dict
    diff: list[dict]
    carried_forward: dict


class PolicySnapshotListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    effective_year: int
    status: str
    created_at: datetime
    approved_at: datetime | None
