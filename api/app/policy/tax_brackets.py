"""Singapore resident income-tax brackets (2026 / YA2024+) and RSTU caps.
Seed source; stored in PolicySnapshot and read by the tax engine."""

# Ordered progressive bands. `upper` is the band's upper bound of chargeable
# income (None = no upper bound). `rate` applies to income within the band.
INCOME_TAX_2026 = [
    {"upper": 20000, "rate": 0.0},
    {"upper": 30000, "rate": 0.02},
    {"upper": 40000, "rate": 0.035},
    {"upper": 80000, "rate": 0.07},
    {"upper": 120000, "rate": 0.115},
    {"upper": 160000, "rate": 0.15},
    {"upper": 200000, "rate": 0.18},
    {"upper": 240000, "rate": 0.19},
    {"upper": 280000, "rate": 0.195},
    {"upper": 320000, "rate": 0.20},
    {"upper": 500000, "rate": 0.22},
    {"upper": 1000000, "rate": 0.23},
    {"upper": None, "rate": 0.24},
]

RSTU_CAPS_2026 = {"self": 8000, "family": 8000, "combined": 16000}

# Supplementary Retirement Scheme. Foreigners get the higher $35,700 cap
# *because* they receive no CPF (and thus no CPF relief) — this asymmetry is
# intentional policy, not a bug. Do not "normalise" the two caps.
SRS_2026 = {
    "cap_citizen_pr": 15300,
    "cap_foreigner": 35700,
    "personal_relief_cap": 80000,   # YA2026+ ceiling on total personal reliefs
    "taxable_fraction": 0.5,        # fraction of each SRS withdrawal that is taxable
    "premature_penalty": 0.05,      # 5% penalty on withdrawals before retirement age
    "withdrawal_years": 10,         # tax-free spread window from first withdrawal
    "statutory_retirement_age": 63,
}
