from decimal import Decimal
from app.engines.domain import AccountState
from app.engines.money import round_to_cent
from app.engines.interest import monthly_base

POLICY = {"interest_rates": {"base": {"OA": 0.025, "SA": 0.04, "MA": 0.04, "RA": 0.04}}}


def test_monthly_base_times_12_equals_annual_on_flat_balance():
    opening = AccountState(OA=Decimal("20000"), SA=Decimal("30000"),
                           MA=Decimal("15000"), RA=Decimal("0"))
    m = monthly_base(opening, POLICY)
    assert round_to_cent(m["OA"] * 12) == Decimal("500.00")    # 20000 * 2.5%
    assert round_to_cent(m["SA"] * 12) == Decimal("1200.00")   # 30000 * 4%
    assert round_to_cent(m["MA"] * 12) == Decimal("600.00")    # 15000 * 4%
    assert round_to_cent(m["RA"] * 12) == Decimal("0.00")
