from decimal import Decimal
from app.engines.allocation import allocate

POLICY = {
    "allocation_rates": {
        "35-45": {"OA": 0.5677, "SAorRA": 0.1891, "MA": 0.2432},
        "55-60": {"OA": 0.3530, "SAorRA": 0.3382, "MA": 0.3088},
    },
}


def test_allocate_age40_total_2220():
    split = allocate(Decimal("2220"), 40, POLICY)
    assert split == {"OA": Decimal("1260"), "SAorRA": Decimal("420"), "MA": Decimal("540")}


def test_allocate_sums_to_total_oa_is_remainder():
    split = allocate(Decimal("2040"), 58, POLICY)
    # MA = round(2040*0.3088)=630, SAorRA = round(2040*0.3382)=690, OA = 2040-630-690=720
    assert split == {"OA": Decimal("720"), "SAorRA": Decimal("690"), "MA": Decimal("630")}
    assert split["OA"] + split["SAorRA"] + split["MA"] == Decimal("2040")
