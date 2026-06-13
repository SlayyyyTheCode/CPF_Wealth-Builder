import pytest

from app.policy.rates import band_for_age, ALLOCATION_2026, CONTRIBUTION_2026


@pytest.mark.parametrize(
    "age,expected",
    [
        (35, "<=35"), (36, "35-45"), (45, "35-45"), (46, "45-50"),
        (50, "45-50"), (51, "50-55"), (55, "50-55"), (56, "55-60"),
        (60, "55-60"), (61, "60-65"), (65, "60-65"), (66, "65-70"),
        (70, "65-70"), (71, ">70"),
    ],
)
def test_band_for_age(age, expected):
    assert band_for_age(age) == expected


def test_allocation_sums_to_one():
    for band, alloc in ALLOCATION_2026.items():
        total = alloc["OA"] + alloc["SAorRA"] + alloc["MA"]
        assert abs(total - 1.0) < 1e-9, f"{band} sums to {total}"


def test_contribution_band_values():
    assert CONTRIBUTION_2026["<=35"] == 0.37
    assert CONTRIBUTION_2026[">70"] == 0.125
