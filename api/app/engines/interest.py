from dataclasses import replace
from decimal import Decimal

from app.engines.domain import AccountState, Event
from app.engines.money import round_to_cent

ZERO = Decimal("0")
TWELVE = Decimal("12")
ACCOUNTS = ("OA", "SA", "MA", "RA")


def _rate(policy: dict, account: str) -> Decimal:
    return Decimal(str(policy["interest_rates"]["base"][account]))


def monthly_base(opening: AccountState, policy: dict) -> dict:
    """Per-account monthly base interest on the month's lowest (opening) balance."""
    return {
        "OA": opening.OA * _rate(policy, "OA") / TWELVE,
        "SA": opening.SA * _rate(policy, "SA") / TWELVE,
        "MA": opening.MA * _rate(policy, "MA") / TWELVE,
        "RA": opening.RA * _rate(policy, "RA") / TWELVE,
    }


def _eligible_balance(opening: AccountState, account: str, oa_cap: Decimal) -> Decimal:
    bal = getattr(opening, account)
    if account == "OA":
        return min(bal, oa_cap)
    return bal


def monthly_extra(opening: AccountState, age: int, policy: dict) -> dict:
    """Per-source-account monthly extra interest, allocated over combined-balance
    tiers in priority order (RA -> OA(capped) -> SA -> MA)."""
    cfg = policy["interest_rates"]
    priority = cfg["priority"]
    result = {a: ZERO for a in ACCOUNTS}

    if age < 55:
        ec = cfg["extra_under55"]
        oa_cap = Decimal(str(ec["oa_cap"]))
        rate = Decimal(str(ec["rate"]))
        remaining = Decimal(str(ec["cap_combined"]))
        for acct in priority:
            if remaining <= ZERO:
                break
            bal = _eligible_balance(opening, acct, oa_cap)
            take = min(bal, remaining)
            result[acct] += take * rate / TWELVE
            remaining -= take
    else:
        ec = cfg["extra_55plus"]
        oa_cap = Decimal(str(ec["oa_cap"]))
        budgets = [
            [Decimal(str(ec["tier1_cap"])), Decimal(str(ec["tier1_rate"]))],
            [Decimal(str(ec["tier2_cap"])), Decimal(str(ec["tier2_rate"]))],
        ]
        for acct in priority:
            if not budgets:
                break
            bal = _eligible_balance(opening, acct, oa_cap)
            while bal > ZERO and budgets:
                cap, rate = budgets[0]
                take = min(bal, cap)
                result[acct] += take * rate / TWELVE
                bal -= take
                cap -= take
                if cap <= ZERO:
                    budgets.pop(0)
                else:
                    budgets[0][0] = cap
    return result


def apply_credit(state: AccountState, base_acc: dict, extra_acc: dict, age: int, policy: dict):
    """Post accumulated base + extra interest at year end.
    <55: OA-extra routes to SA, other extra to own account.
    55+: all extra routes to RA.

    A full MediSave (at the BHS) cannot hold its own interest: any MA interest
    that would push MA above the BHS cascades out using the same order as
    contributions — SA up to the FRS (RA post-55), then OA.

    Returns (state, base_total, extra_total, event, ma_overflow) where
    ma_overflow = {"to_SA", "to_RA", "to_OA"}."""
    base = {a: round_to_cent(base_acc[a]) for a in ACCOUNTS}
    extra = {a: round_to_cent(extra_acc[a]) for a in ACCOUNTS}
    base_total = sum(base.values(), ZERO)
    extra_total = sum(extra.values(), ZERO)

    if age < 55:
        oa = state.OA + base["OA"]
        sa = state.SA + base["SA"] + extra["SA"] + extra["OA"]
        ma = state.MA + base["MA"] + extra["MA"]
        ra = state.RA + base["RA"] + extra["RA"]
    else:
        extra_to_ra = extra["OA"] + extra["SA"] + extra["MA"] + extra["RA"]
        oa = state.OA + base["OA"]
        sa = state.SA + base["SA"]
        ma = state.MA + base["MA"]
        ra = state.RA + base["RA"] + extra_to_ra

    # MA interest can't stay once MA is at the BHS — cascade the excess.
    bhs = Decimal(str(policy["bhs"]))
    frs = Decimal(str(policy["frs"]))
    ma_ovf = {"to_SA": ZERO, "to_RA": ZERO, "to_OA": ZERO}
    if ma > bhs:
        excess = ma - bhs
        ma = bhs
        if age < 55:
            to_sa = min(excess, max(frs - sa, ZERO))
            sa += to_sa
            oa += excess - to_sa
            ma_ovf["to_SA"] = to_sa
            ma_ovf["to_OA"] = excess - to_sa
        else:
            to_ra = min(excess, max(frs - ra, ZERO))
            ra += to_ra
            oa += excess - to_ra
            ma_ovf["to_RA"] = to_ra
            ma_ovf["to_OA"] = excess - to_ra

    new = replace(state, OA=oa, SA=sa, MA=ma, RA=ra)
    event = Event("INTEREST_CREDITED", 0, 12, {"base": base_total, "extra": extra_total})
    return new, base_total, extra_total, event, ma_ovf
