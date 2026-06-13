from decimal import Decimal

# Best-known 2026 MediShield Life annual premiums by upper age bound.
# Source: CPF Board / MOH MediShield Life premium schedule.
MEDISHIELD_PREMIUMS_2026 = [
    {"max_age": 20, "annual": 200},
    {"max_age": 40, "annual": 435},
    {"max_age": 50, "annual": 630},
    {"max_age": 60, "annual": 870},
    {"max_age": 65, "annual": 1085},
    {"max_age": 70, "annual": 1250},
    {"max_age": 75, "annual": 1630},
    {"max_age": 80, "annual": 1975},
    {"max_age": 85, "annual": 2330},
    {"max_age": 90, "annual": 2510},
    {"max_age": None, "annual": 2620},
]


def premium_for_age(age: int, table: list) -> Decimal:
    """Return the annual MediShield Life premium for a given age using the supplied table."""
    for band in table:
        if band["max_age"] is None or age <= band["max_age"]:
            return Decimal(str(band["annual"]))
    return Decimal(str(table[-1]["annual"]))
