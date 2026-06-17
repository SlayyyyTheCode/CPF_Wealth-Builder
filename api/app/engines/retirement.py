from dataclasses import replace
from decimal import Decimal

from app.engines.domain import AccountState

ZERO = Decimal("0")
# CPF lets a member keep up to $5,000 in the OA (withdrawable) when their
# SA + OA cannot meet the retirement sum at 55.
MIN_OA_RETENTION = Decimal("5000")


def form_ra(state: AccountState, target: Decimal):
    """Age-55 atomic RA formation: fill RA from SA then OA up to target;
    any SA left after closes to OA. On a shortfall (SA+OA < target) up to
    $5,000 stays withdrawable in the OA. Returns (new_state, detail)."""
    from_sa = min(state.SA, target)
    ra = from_sa
    sa_after_fill = state.SA - from_sa

    remaining_need = target - ra
    oa_retained = ZERO
    if remaining_need > ZERO:
        if state.OA < remaining_need:
            # Cannot meet the sum — leave up to $5,000 in the OA, rest to RA.
            from_oa = max(state.OA - MIN_OA_RETENTION, ZERO)
            oa_retained = state.OA - from_oa
        else:
            from_oa = remaining_need
    else:
        from_oa = ZERO
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
        "oa_retained": oa_retained,
    }
    return new, detail
