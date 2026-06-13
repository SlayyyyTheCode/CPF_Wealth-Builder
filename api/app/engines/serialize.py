from decimal import Decimal

from app.engines.domain import AccountState, SimulationResult


def _acct(s: AccountState) -> dict:
    return {"OA": float(s.OA), "SA": float(s.SA), "MA": float(s.MA), "RA": float(s.RA)}


def _num(v):
    return float(v) if isinstance(v, Decimal) else v


def serialize_result(res: SimulationResult) -> dict:
    return {
        "final": _acct(res.final),
        "years": [
            {
                "year": y.year, "age": y.age,
                "opening": _acct(y.opening), "closing": _acct(y.closing),
                "total_contributions": float(y.total_contributions),
                "interest_base": float(y.interest_base),
                "interest_extra": float(y.interest_extra),
                "interest_by_account": y.interest_by_account,
                "contribution_by_account": y.contribution_by_account,
                "overflow_out": y.overflow_out,
            }
            for y in res.years
        ],
        "months": [
            {
                "year": m.year, "month": m.month, "age": m.age,
                "opening": _acct(m.opening), "closing": _acct(m.closing),
            }
            for m in res.months
        ],
        "events": [
            {"kind": e.kind, "year": e.year, "month": e.month,
             "detail": {k: _num(v) for k, v in e.detail.items()}}
            for e in res.events
        ],
        "cpf_life": {k: _num(v) for k, v in res.cpf_life.items()},
        "ra_at_payout": float(res.ra_at_payout) if res.ra_at_payout is not None else None,
    }
