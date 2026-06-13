from __future__ import annotations

from datetime import date


def compute_milestones(res, dob: date, resolve) -> dict:
    """Return the first age at which each CPF milestone is reached.

    Keys: bhs_age, frs_age, ers_age, cpf_life_eligible_age.
    Values are int ages or None if the threshold is never crossed.
    """
    out = {
        "bhs_age": None,
        "frs_age": None,
        "ers_age": None,
        "cpf_life_eligible_age": None,
    }
    for m in res.months:
        p = resolve(m.year)
        c = m.closing
        if out["bhs_age"] is None and c.MA >= p["bhs"]:
            out["bhs_age"] = m.age
        if out["frs_age"] is None and (c.SA >= p["frs"] or c.RA >= p["frs"]):
            out["frs_age"] = m.age
        if out["ers_age"] is None and c.RA >= p["ers"]:
            out["ers_age"] = m.age
        if out["cpf_life_eligible_age"] is None and c.RA >= p["cpf_life_eligibility_min"]:
            out["cpf_life_eligible_age"] = m.age
    return out
