CORE_FIELDS = ["effective_year", "frs", "brs", "ers", "bhs",
               "ordinary_wage_ceiling", "additional_wage_ceiling", "cpf_life_eligibility_min"]


def diff_policy(extracted: dict, active: dict) -> list[dict]:
    rows = []
    for f in CORE_FIELDS:
        cur, ext = active.get(f), extracted.get(f)
        rows.append({"field": f, "current": cur, "extracted": ext, "changed": cur != ext})
    return rows
