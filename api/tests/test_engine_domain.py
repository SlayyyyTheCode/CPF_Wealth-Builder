from decimal import Decimal
import dataclasses
import pytest
from app.engines.domain import AccountState, SelfEmployedNotSupported


def test_account_state_defaults_zero():
    s = AccountState()
    assert (s.OA, s.SA, s.MA, s.RA) == (Decimal("0"),) * 4


def test_account_state_is_frozen():
    s = AccountState(OA=Decimal("100"))
    with pytest.raises(dataclasses.FrozenInstanceError):
        s.OA = Decimal("200")


def test_self_employed_error_is_exception():
    assert issubclass(SelfEmployedNotSupported, Exception)
