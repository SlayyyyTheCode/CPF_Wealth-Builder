from decimal import Decimal
from app.engines.domain import AccountState
from app.engines.overflow import apply_ma, apply_saorra

POLICY = {"bhs": Decimal("79000"), "frs": Decimal("220400")}


def test_apply_ma_no_overflow():
    s = AccountState(MA=Decimal("1000"))
    new, detail = apply_ma(s, Decimal("480"), 40, POLICY)
    assert new.MA == Decimal("1480")
    assert detail is None


def test_apply_ma_overflow_under55_to_sa():
    s = AccountState(MA=Decimal("78900"), SA=Decimal("50000"), OA=Decimal("10000"))
    new, detail = apply_ma(s, Decimal("480"), 40, POLICY)
    # room=100 -> MA=79000, overflow=380 -> SA (room huge)
    assert new.MA == Decimal("79000")
    assert new.SA == Decimal("50380")
    assert new.OA == Decimal("10000")
    assert detail == {"overflow": Decimal("380"), "to_SA": Decimal("380"), "to_OA": Decimal("0")}


def test_apply_ma_overflow_under55_sa_at_frs_to_oa():
    s = AccountState(MA=Decimal("78900"), SA=Decimal("220400"), OA=Decimal("10000"))
    new, detail = apply_ma(s, Decimal("480"), 40, POLICY)
    assert new.SA == Decimal("220400")
    assert new.OA == Decimal("10380")
    assert detail["to_OA"] == Decimal("380")


def test_apply_ma_overflow_55plus_to_ra():
    s = AccountState(MA=Decimal("78900"), RA=Decimal("100000"), OA=Decimal("5000"))
    new, detail = apply_ma(s, Decimal("630"), 60, POLICY)
    # room=100 -> MA=79000, overflow=530 -> RA
    assert new.MA == Decimal("79000")
    assert new.RA == Decimal("100530")
    assert detail == {"overflow": Decimal("530"), "to_RA": Decimal("530"), "to_OA": Decimal("0")}


def test_apply_saorra_under55_goes_to_sa():
    s = AccountState(SA=Decimal("420"))
    assert apply_saorra(s, Decimal("420"), 40, POLICY).SA == Decimal("840")


def test_apply_saorra_55plus_to_ra_under_frs():
    s = AccountState(RA=Decimal("100000"), OA=Decimal("720"))
    new = apply_saorra(s, Decimal("690"), 60, POLICY)
    assert new.RA == Decimal("100690")
    assert new.OA == Decimal("720")


def test_apply_saorra_55plus_ra_at_frs_overflows_to_oa():
    s = AccountState(RA=Decimal("220400"), OA=Decimal("720"))
    new = apply_saorra(s, Decimal("690"), 60, POLICY)
    assert new.RA == Decimal("220400")
    assert new.OA == Decimal("1410")
