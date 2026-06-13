from dataclasses import replace
from decimal import Decimal

from app.engines.domain import AccountState

ZERO = Decimal("0")


def form_ra(state: AccountState, target: Decimal):
    """Age-55 atomic RA formation: fill RA from SA then OA up to target;
    any SA left after closes to OA. Returns (new_state, detail)."""
    from_sa = min(state.SA, target)
    ra = from_sa
    sa_after_fill = state.SA - from_sa

    remaining_need = target - ra
    from_oa = min(state.OA, remaining_need) if remaining_need > ZERO else ZERO
    ra += from_oa
    oa_after_fill = state.OA - from_oa

    sa_to_oa = sa_after_fill           # SA closes; whatever is left moves to OA
    new = replace(
        state,
        RA=state.RA + ra,
        OA=oa_after_fill + sa_to_oa,
        SA=ZERO,
    )
    detail = {
        "ra_formed": ra,
        "from_sa": from_sa,
        "from_oa": from_oa,
        "sa_to_oa": sa_to_oa,
    }
    return new, detail
