from app.policy.rates import (
    CONTRIBUTION_2026, ALLOCATION_2026, CONTRIBUTION_2027, ALLOCATION_2027,
)
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


# ── 2027 ─────────────────────────────────────────────────────────────────────
# Everything not listed here is CARRIED FORWARD unchanged from 2026 (the
# resolver does the same for any year without its own snapshot).
#
# Verified 2026-09-25 against CPF's own published pages/PDFs:
#   - ERS 2027 = $456,400 (CPF "What is the Enhanced Retirement Sum" table).
#     FRS and BRS follow from CPF's fixed relationships (ERS = 2 x FRS = 4 x
#     BRS): FRS $228,200, BRS $114,100 — also the figures CPF has announced.
#   - Contribution + allocation: the Jan-2027 senior-worker step-up
#     (55-60: 34% -> 35.5%, 60-65: 25% -> 26%; increase goes to the RA).
#   - Ordinary Wage ceiling stays $8,000 (stated in CPF's Jan-2027 rate table).
#
# NOT YET ANNOUNCED — BHS for 2027. CPF's page says only that it "will be
# adjusted yearly". Until it is published this carries the growth-assumption
# ESTIMATE, 79,000 x (1 + 4.5%) = 82,555 — exactly what the engine already
# projected for 2027 before this snapshot existed, so BHS behaviour does not
# change. Replace with the official figure when CPF announces it (the monthly
# policy check flags the difference).
SEED_2027 = {
    **SEED_2026,
    "effective_year": 2027,
    "frs": 228200, "brs": 114100, "ers": 456400,
    "bhs": 82555,                      # ESTIMATE — see note above
    "contribution_rates": CONTRIBUTION_2027,
    "allocation_rates": ALLOCATION_2027,
}
