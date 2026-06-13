"""Age-band rate constants (seed values for 2026). Stored in PolicySnapshot;
these constants are the seed source, not read directly by engines."""

BANDS = ["<=35", "35-45", "45-50", "50-55", "55-60", "60-65", "65-70", ">70"]


def band_for_age(age: int) -> str:
    if age <= 35:
        return "<=35"
    if age <= 45:
        return "35-45"
    if age <= 50:
        return "45-50"
    if age <= 55:
        return "50-55"
    if age <= 60:
        return "55-60"
    if age <= 65:
        return "60-65"
    if age <= 70:
        return "65-70"
    return ">70"


# Total (employee + employer) contribution rate by band.
# Confirmed from cpf.gov.sg (2026 senior-worker step-up): 55-60 = 34%, 60-65 = 25%.
CONTRIBUTION_2026 = {
    "<=35": 0.37, "35-45": 0.37, "45-50": 0.37, "50-55": 0.37,
    "55-60": 0.34, "60-65": 0.25, "65-70": 0.165, ">70": 0.125,
}

# Allocation ratios from Jan-2026 CPF file. "SAorRA" = SA (<55) or RA (55+).
ALLOCATION_2026 = {
    "<=35":  {"OA": 0.6217, "SAorRA": 0.1621, "MA": 0.2162},
    "35-45": {"OA": 0.5677, "SAorRA": 0.1891, "MA": 0.2432},
    "45-50": {"OA": 0.5136, "SAorRA": 0.2162, "MA": 0.2702},
    "50-55": {"OA": 0.4055, "SAorRA": 0.3108, "MA": 0.2837},
    "55-60": {"OA": 0.3530, "SAorRA": 0.3382, "MA": 0.3088},
    "60-65": {"OA": 0.1400, "SAorRA": 0.4400, "MA": 0.4200},
    "65-70": {"OA": 0.0607, "SAorRA": 0.3030, "MA": 0.6363},
    ">70":   {"OA": 0.0800, "SAorRA": 0.0800, "MA": 0.8400},
}
