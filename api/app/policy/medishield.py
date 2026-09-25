from decimal import Decimal

# MediShield Life annual premiums (BEFORE subsidies, GST-inclusive), by AGE NEXT
# BIRTHDAY. `max_age` is the upper bound of that band's age-next-birthday range
# (None = open-ended).
#
# Source: CPF Board's "MediShield Life Premium Schedule for Singapore Citizens and
# Permanent Residents", Table B (applicable for policy start/renewal on or after
# 1 Apr 2025) — cpf.gov.sg/content/dam/web/member/healthcare/documents/
# MediShield Life Premium Table.pdf. Fetched and text-extracted 2026-09-25; this is
# the latest schedule CPF publishes. It REPLACES an earlier "best-known estimate"
# table that was wrong in every band except the first (e.g. 21-40 was one band at
# $435 vs the official $295 / $503, and >90 was $2,620 vs the official $2,826).
MEDISHIELD_PREMIUMS_2026 = [
    {"max_age": 20, "annual": 200},    # 1  - 20
    {"max_age": 30, "annual": 295},    # 21 - 30
    {"max_age": 40, "annual": 503},    # 31 - 40
    {"max_age": 50, "annual": 637},    # 41 - 50
    {"max_age": 60, "annual": 903},    # 51 - 60
    {"max_age": 65, "annual": 1131},   # 61 - 65
    {"max_age": 70, "annual": 1326},   # 66 - 70
    {"max_age": 73, "annual": 1643},   # 71 - 73
    {"max_age": 75, "annual": 1816},   # 74 - 75
    {"max_age": 78, "annual": 2027},   # 76 - 78
    {"max_age": 80, "annual": 2187},   # 79 - 80
    {"max_age": 83, "annual": 2303},   # 81 - 83
    {"max_age": 85, "annual": 2616},   # 84 - 85
    {"max_age": 88, "annual": 2785},   # 86 - 88
    {"max_age": 90, "annual": 2785},   # 89 - 90
    {"max_age": None, "annual": 2826}, # > 90
]


def premium_for_age(age: int, table: list) -> Decimal:
    """Annual MediShield Life premium for a member whose CURRENT age is `age`.

    The published schedule is keyed by AGE NEXT BIRTHDAY, so the lookup uses
    age + 1: a 40-year-old is in the "41 - 50" band, not "31 - 40".
    """
    anb = age + 1
    for band in table:
        if band["max_age"] is None or anb <= band["max_age"]:
            return Decimal(str(band["annual"]))
    return Decimal(str(table[-1]["annual"]))
