from dataclasses import replace
from decimal import Decimal

from app.engines.domain import AccountState

ZERO = Decimal("0")


def apply_ma(state: AccountState, ma_in: Decimal, age: int, policy: dict):
    """Deposit MA share; cascade excess over BHS -> SA(<55)/RA(55+) up to FRS -> OA."""
    bhs = policy["bhs"]
    frs = policy["frs"]
    room = max(bhs - state.MA, ZERO)
    to_ma = min(ma_in, room)
    overflow = ma_in - to_ma
    new_ma = state.MA + to_ma
    if overflow <= ZERO:
        return replace(state, MA=new_ma), None

    if age < 55:
        sa_room = max(frs - state.SA, ZERO)
        to_sa = min(overflow, sa_room)
        to_oa = overflow - to_sa
        new = replace(state, MA=new_ma, SA=state.SA + to_sa, OA=state.OA + to_oa)
        detail = {"overflow": overflow, "to_SA": to_sa, "to_OA": to_oa}
    else:
        ra_room = max(frs - state.RA, ZERO)
        to_ra = min(overflow, ra_room)
        to_oa = overflow - to_ra
        new = replace(state, MA=new_ma, RA=state.RA + to_ra, OA=state.OA + to_oa)
        detail = {"overflow": overflow, "to_RA": to_ra, "to_OA": to_oa}
    return new, detail


def saorra_overflow(state: AccountState, amount: Decimal, age: int, policy: dict) -> Decimal:
    """Return the amount that would overflow from SA/RA routing to OA (0 if none)."""
    if age < 55:
        return ZERO
    frs = policy["frs"]
    ra_room = max(frs - state.RA, ZERO)
    return max(amount - ra_room, ZERO)


def apply_saorra(state: AccountState, amount: Decimal, age: int, policy: dict) -> AccountState:
    """Deposit the SA/RA share. SA if <55; else RA up to FRS, remainder to OA."""
    if age < 55:
        return replace(state, SA=state.SA + amount)
    frs = policy["frs"]
    ra_room = max(frs - state.RA, ZERO)
    to_ra = min(amount, ra_room)
    to_oa = amount - to_ra
    return replace(state, RA=state.RA + to_ra, OA=state.OA + to_oa)
