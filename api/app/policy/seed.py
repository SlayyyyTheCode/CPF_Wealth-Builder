from app.policy.rates import CONTRIBUTION_2026, ALLOCATION_2026
from app.policy.tax_brackets import INCOME_TAX_2026, RSTU_CAPS_2026, SRS_2026
from app.policy.medishield import MEDISHIELD_PREMIUMS_2026
from app.policy.assumptions import ASSUMPTIONS_2026

# Interest config. Extra-interest priority order: RA -> OA(cap) -> SA -> MA.
INTEREST_2026 = {
    "base": {"OA": 0.025, "SA": 0.04, "MA": 0.04, "RA": 0.04},
    "extra_under55": {"rate": 0.01, "cap_combined": 60000, "oa_cap": 20000},
    "extra_55plus": {
        "tier1_rate": 0.02, "tier1_cap": 30000,
        "tier2_rate": 0.01, "tier2_cap": 30000, "oa_cap": 20000,
    },
    "priority": ["RA", "OA", "SA", "MA"],
}

SEED_2026 = {
    "effective_year": 2026,
    "status": "active",
    "frs": 220400, "brs": 110200, "ers": 440800, "bhs": 79000,
    "cpf_life_eligibility_min": 60000,
    "ordinary_wage_ceiling": 8000,        # confirmed 2026 (cpf.gov.sg)
    "additional_wage_ceiling": 102000,    # confirmed 2026 (102k - OW subject to CPF)
    "contribution_rates": CONTRIBUTION_2026,
    "allocation_rates": ALLOCATION_2026,
    "interest_rates": INTEREST_2026,
    "income_tax_brackets": INCOME_TAX_2026,
    "rstu_caps": RSTU_CAPS_2026,
    "srs": SRS_2026,
    "medishield_premiums": MEDISHIELD_PREMIUMS_2026,
    "assumptions": ASSUMPTIONS_2026,
}
