from decimal import Decimal
from app.engines.domain import AccountState
from app.engines.retirement import form_ra

FRS = Decimal("220400")
BRS = Decimal("110200")
ERS = Decimal("440800")


def test_form_ra_sa_covers_target_remainder_to_oa():
    s = AccountState(OA=Decimal("100000"), SA=Decimal("250000"), MA=Decimal("60000"))
    new, detail = form_ra(s, FRS)
    assert new.RA == FRS
    assert new.SA == Decimal("0")
    assert new.OA == Decimal("129600")   # 100000 + (250000-220400)
    assert new.MA == Decimal("60000")
    assert detail["from_sa"] == FRS
    assert detail["from_oa"] == Decimal("0")
    assert detail["sa_to_oa"] == Decimal("29600")


def test_form_ra_needs_sa_and_oa():
    s = AccountState(OA=Decimal("100000"), SA=Decimal("150000"), MA=Decimal("60000"))
    new, detail = form_ra(s, FRS)
    assert new.RA == FRS
    assert new.SA == Decimal("0")
    assert new.OA == Decimal("29600")    # 100000 - 70400
    assert detail["from_sa"] == Decimal("150000")
    assert detail["from_oa"] == Decimal("70400")


def test_form_ra_shortfall_keeps_5k_in_oa():
    # SA+OA < FRS → keep up to $5,000 withdrawable in OA, rest to RA.
    s = AccountState(OA=Decimal("20000"), SA=Decimal("50000"), MA=Decimal("60000"))
    new, detail = form_ra(s, FRS)
    assert new.RA == Decimal("65000")    # 50000 + (20000 - 5000)
    assert new.OA == Decimal("5000")
    assert new.SA == Decimal("0")
    assert detail["from_oa"] == Decimal("15000")
    assert detail["oa_retained"] == Decimal("5000")


def test_form_ra_shortfall_small_oa_kept_whole():
    # OA below the $5k cap stays entirely in OA.
    s = AccountState(OA=Decimal("3000"), SA=Decimal("50000"), MA=Decimal("60000"))
    new, detail = form_ra(s, FRS)
    assert new.RA == Decimal("50000")
    assert new.OA == Decimal("3000")
    assert detail["from_oa"] == Decimal("0")
    assert detail["oa_retained"] == Decimal("3000")


def test_form_ra_brs_target_leaves_sa_remainder_to_oa():
    s = AccountState(OA=Decimal("100000"), SA=Decimal("150000"))
    new, detail = form_ra(s, BRS)
    assert new.RA == BRS
    assert new.OA == Decimal("139800")   # 100000 + (150000-110200)
    assert new.SA == Decimal("0")


def test_form_ra_ers_target_uses_oa():
    s = AccountState(OA=Decimal("300000"), SA=Decimal("250000"))
    new, detail = form_ra(s, ERS)
    assert new.RA == ERS
    assert new.OA == Decimal("109200")   # 300000 - 190800
    assert new.SA == Decimal("0")
