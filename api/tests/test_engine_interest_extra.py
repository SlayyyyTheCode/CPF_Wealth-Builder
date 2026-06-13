from decimal import Decimal
from app.engines.domain import AccountState
from app.engines.money import round_to_cent
from app.engines.interest import monthly_extra, apply_credit

POLICY = {"interest_rates": {
    "extra_under55": {"rate": 0.01, "cap_combined": 60000, "oa_cap": 20000},
    "extra_55plus": {"tier1_rate": 0.02, "tier1_cap": 30000,
                     "tier2_rate": 0.01, "tier2_cap": 30000, "oa_cap": 20000},
    "priority": ["RA", "OA", "SA", "MA"],
}}


def _annual(m):
    return {k: round_to_cent(v * 12) for k, v in m.items()}


def test_extra_under55_priority_and_oa_cap():
    opening = AccountState(OA=Decimal("20000"), SA=Decimal("30000"),
                           MA=Decimal("15000"), RA=Decimal("0"))
    # combined 65000; first 60000 eligible. RA0, OA capped 20000, SA 30000, MA 10000.
    a = _annual(monthly_extra(opening, 40, POLICY))
    assert a == {"OA": Decimal("200.00"), "SA": Decimal("300.00"),
                 "MA": Decimal("100.00"), "RA": Decimal("0.00")}


def test_extra_55plus_ra_dominant_tiers():
    opening = AccountState(OA=Decimal("0"), SA=Decimal("0"),
                           MA=Decimal("0"), RA=Decimal("100000"))
    # tier1 30000@2% + tier2 30000@1% all from RA = 600 + 300 = 900
    a = _annual(monthly_extra(opening, 60, POLICY))
    assert a["RA"] == Decimal("900.00")
    assert a["OA"] == a["SA"] == a["MA"] == Decimal("0.00")


def test_extra_55plus_spills_across_accounts():
    opening = AccountState(OA=Decimal("20000"), SA=Decimal("0"),
                           MA=Decimal("50000"), RA=Decimal("20000"))
    # RA 20000(t1) ; OA 10000(t1)+10000(t2) ; MA 20000(t2)
    a = _annual(monthly_extra(opening, 60, POLICY))
    assert a["RA"] == Decimal("400.00")   # 20000*2%
    assert a["OA"] == Decimal("300.00")   # 10000*2% + 10000*1%
    assert a["MA"] == Decimal("200.00")   # 20000*1%


def test_apply_credit_under55_routes_oa_extra_to_sa():
    state = AccountState(OA=Decimal("20000"), SA=Decimal("30000"),
                         MA=Decimal("15000"), RA=Decimal("0"))
    base = {"OA": Decimal("500"), "SA": Decimal("1200"), "MA": Decimal("600"), "RA": Decimal("0")}
    extra = {"OA": Decimal("200"), "SA": Decimal("300"), "MA": Decimal("100"), "RA": Decimal("0")}
    new, base_total, extra_total, ev = apply_credit(state, base, extra, 40)
    assert new.OA == Decimal("20500.00")                 # base only
    assert new.SA == Decimal("31700.00")                 # 30000 + 1200 + (200+300)
    assert new.MA == Decimal("15700.00")                 # 15000 + 600 + 100
    assert new.RA == Decimal("0.00")
    assert base_total == Decimal("2300.00")
    assert extra_total == Decimal("600.00")
    assert ev.kind == "INTEREST_CREDITED"


def test_apply_credit_55plus_routes_all_extra_to_ra():
    state = AccountState(OA=Decimal("10000"), SA=Decimal("0"),
                         MA=Decimal("50000"), RA=Decimal("100000"))
    base = {"OA": Decimal("250"), "SA": Decimal("0"), "MA": Decimal("2000"), "RA": Decimal("4000")}
    extra = {"OA": Decimal("300"), "SA": Decimal("0"), "MA": Decimal("200"), "RA": Decimal("400")}
    new, base_total, extra_total, ev = apply_credit(state, base, extra, 60)
    assert new.OA == Decimal("10250.00")
    assert new.MA == Decimal("52000.00")
    assert new.RA == Decimal("104900.00")                # 100000 + 4000 + (300+200+400)
    assert extra_total == Decimal("900.00")
