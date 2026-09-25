"""MediShield Life premiums — official CPF Table B (before subsidies, GST-inclusive,
renewals on/after 1 Apr 2025), keyed by AGE NEXT BIRTHDAY.

Figures fetched and text-extracted from CPF's own PDF on 2026-09-25 and asserted
literally, so seed drift from the published schedule fails loudly.
"""
from decimal import Decimal

import pytest

from app.policy.medishield import premium_for_age, MEDISHIELD_PREMIUMS_2026 as T

# (age-next-birthday, official annual premium) — one point inside every band.
OFFICIAL_BY_ANB = [
    (1, 200), (20, 200),
    (21, 295), (30, 295),
    (31, 503), (40, 503),
    (41, 637), (50, 637),
    (51, 903), (60, 903),
    (61, 1131), (65, 1131),
    (66, 1326), (70, 1326),
    (71, 1643), (73, 1643),
    (74, 1816), (75, 1816),
    (76, 2027), (78, 2027),
    (79, 2187), (80, 2187),
    (81, 2303), (83, 2303),
    (84, 2616), (85, 2616),
    (86, 2785), (88, 2785),
    (89, 2785), (90, 2785),
    (91, 2826), (105, 2826),
]


@pytest.mark.parametrize("anb,expected", OFFICIAL_BY_ANB)
def test_official_premium_by_age_next_birthday(anb, expected):
    # premium_for_age takes CURRENT age, so age = anb - 1.
    assert premium_for_age(anb - 1, T) == Decimal(str(expected))


def test_lookup_uses_age_next_birthday_not_current_age():
    """A 40-year-old has age-next-birthday 41 -> the '41 - 50' band ($637), not
    the '31 - 40' band ($503). The schedule is keyed by ANB."""
    assert premium_for_age(40, T) == Decimal("637")
    assert premium_for_age(39, T) == Decimal("503")
    assert premium_for_age(20, T) == Decimal("295")   # ANB 21
    assert premium_for_age(19, T) == Decimal("200")   # ANB 20


def test_premiums_never_fall_as_age_rises():
    prev = Decimal("0")
    for age in range(0, 110):
        p = premium_for_age(age, T)
        assert p >= prev, f"premium fell at age {age}"
        prev = p


def test_table_shape_is_well_formed():
    bounds = [b["max_age"] for b in T if b["max_age"] is not None]
    assert bounds == sorted(bounds)                # ascending
    assert T[-1]["max_age"] is None                # open-ended top band
    assert len(T) == 16                            # the 16 rows CPF publishes
