from dataclasses import replace
from datetime import date
from decimal import Decimal
from typing import Callable

from app.engines.domain import (
    AccountState, SimulationInput, SimulationResult,
    MonthState, YearResult, Event, SelfEmployedNotSupported,
)
from app.engines.contribution import monthly_contribution
from app.engines.allocation import allocate
from app.engines.overflow import apply_ma, apply_saorra, saorra_overflow
from app.engines.interest import monthly_base, monthly_extra, apply_credit
from app.engines.money import round_to_cent, round_to_dollar
from app.policy.rates import band_for_age
from app.engines.retirement import form_ra
from app.engines.cpflife import project_cpf_life

ZERO = Decimal("0")
ACCOUNTS = ("OA", "SA", "MA", "RA")
_TARGET_KEY = {"BRS": "brs", "FRS": "frs", "ERS": "ers"}


def age_at(dob: date, year: int, month: int) -> int:
    """Completed age at the start of (year, month), month granularity."""
    return year - dob.year - (1 if month < dob.month else 0)


def _zero_acc():
    return {a: ZERO for a in ACCOUNTS}


def run_simulation(inp: SimulationInput, resolve_policy: Callable[[int], dict]) -> SimulationResult:
    if inp.employment_status == "self-employed":
        raise SelfEmployedNotSupported(
            "Self-employed members are not supported by the employee accumulation engine."
        )

    state = inp.opening
    wage = inp.monthly_gross_wage
    events: list[Event] = []
    months: list[MonthState] = []
    years: list[YearResult] = []

    year = inp.start_year
    turn55_year = inp.dob.year + 55
    payout_year = inp.dob.year + inp.payout_age
    ra_at_payout = None

    while age_at(inp.dob, year, 1) < inp.end_age:
        policy = resolve_policy(year)
        # Annual salary increment compounds from the second projection year on.
        if year > inp.start_year and inp.salary_increment > ZERO:
            wage = wage * (Decimal("1") + inp.salary_increment)
        year_open = state
        base_acc = _zero_acc()
        extra_acc = _zero_acc()
        contrib_acc = _zero_acc()
        total_contrib = ZERO
        ovf_year = {
            "ma_to_sa": ZERO, "ma_to_oa": ZERO, "ma_to_ra": ZERO,
            "sa_to_oa": ZERO, "sa_to_ra": ZERO,
        }

        for month in range(1, 13):
            age = age_at(inp.dob, year, month)

            # 1. Age-55 atomic RA formation (before this month's contribution)
            if year == turn55_year and month == inp.dob.month:
                target = policy[_TARGET_KEY[inp.retirement_sum_target]]
                state, detail = form_ra(state, target)
                events.append(Event("RA_FORMED", year, month, detail))
                events.append(Event("SA_CLOSED", year, month, {"sa_to_oa": detail["sa_to_oa"]}))

            # Capture RA at the payout-age birthday (start of that month)
            if year == payout_year and month == inp.dob.month:
                ra_at_payout = state.RA

            opening = state

            # 2. Accrue interest on the month's lowest (opening) balance
            mb = monthly_base(opening, policy)
            me = monthly_extra(opening, age, policy)
            for a in ACCOUNTS:
                base_acc[a] += mb[a]
                extra_acc[a] += me[a]

            # 3. Contribution + allocation + routing
            total = monthly_contribution(wage, age, policy)
            total_contrib += total
            split = allocate(total, age, policy)
            # Contribution from wage routed by account (before any overflow out).
            # The SAorRA slice lands in SA before 55 and in RA from 55 onward.
            contrib_acc["OA"] += split["OA"]
            contrib_acc["MA"] += split["MA"]
            contrib_acc["RA" if age >= 55 else "SA"] += split["SAorRA"]
            state = replace(state, OA=state.OA + split["OA"])
            state, ovf = apply_ma(state, split["MA"], age, policy)
            if ovf is not None:
                events.append(Event("MA_OVERFLOW", year, month, ovf))
                ovf_year["ma_to_sa"] += ovf.get("to_SA", ZERO)
                ovf_year["ma_to_oa"] += ovf.get("to_OA", ZERO)
                ovf_year["ma_to_ra"] += ovf.get("to_RA", ZERO)
            sa_oa = saorra_overflow(state, split["SAorRA"], age, policy)
            if sa_oa > ZERO:
                events.append(Event("SA_OVERFLOW", year, month, {"to_oa": sa_oa}))
                ovf_year["sa_to_oa"] += sa_oa
            state = apply_saorra(state, split["SAorRA"], age, policy)

            # 3b. Annual bonus (paid in December) — CPF as Additional Wage,
            # capped by the AW ceiling (aw_ceiling = 102k − the year's OW).
            if month == 12 and inp.bonus_months > ZERO:
                ow_subject = Decimal("12") * min(wage, policy["ow_ceiling"])
                aw_room = max(policy["aw_ceiling"] - ow_subject, ZERO)
                aw_base = min(inp.bonus_months * wage, aw_room)
                if aw_base > ZERO:
                    rate = Decimal(str(policy["contribution_rates"][band_for_age(age)]))
                    total_b = round_to_dollar(aw_base * rate)
                    total_contrib += total_b
                    split_b = allocate(total_b, age, policy)
                    contrib_acc["OA"] += split_b["OA"]
                    contrib_acc["MA"] += split_b["MA"]
                    contrib_acc["RA" if age >= 55 else "SA"] += split_b["SAorRA"]
                    state = replace(state, OA=state.OA + split_b["OA"])
                    state, ovfb = apply_ma(state, split_b["MA"], age, policy)
                    if ovfb is not None:
                        ovf_year["ma_to_sa"] += ovfb.get("to_SA", ZERO)
                        ovf_year["ma_to_oa"] += ovfb.get("to_OA", ZERO)
                        ovf_year["ma_to_ra"] += ovfb.get("to_RA", ZERO)
                    sa_oa_b = saorra_overflow(state, split_b["SAorRA"], age, policy)
                    if sa_oa_b > ZERO:
                        ovf_year["sa_to_oa"] += sa_oa_b
                    state = apply_saorra(state, split_b["SAorRA"], age, policy)

            months.append(MonthState(year, month, age, opening, state))

            # 4. Year-end interest credit
            if month == 12:
                state, base_total, extra_total, ev = apply_credit(
                    state, base_acc, extra_acc, age
                )
                events.append(Event("INTEREST_CREDITED", year, 12,
                                    {"base": base_total, "extra": extra_total}))
                years.append(YearResult(
                    year=year, age=age, opening=year_open, closing=state,
                    total_contributions=total_contrib,
                    interest_base=base_total, interest_extra=extra_total,
                    interest_by_account={
                        a: float(round_to_cent(base_acc[a] + extra_acc[a]))
                        for a in ACCOUNTS
                    },
                    contribution_by_account={
                        a: float(round_to_cent(contrib_acc[a])) for a in ACCOUNTS
                    },
                    overflow_out={k: float(v) for k, v in ovf_year.items()},
                ))

        year += 1

    cpf_life: dict = {}
    if ra_at_payout is not None:
        payout_policy = resolve_policy(payout_year)
        cpf_life = project_cpf_life(
            ra_at_payout, inp.dob, inp.payout_age, inp.cpf_life_plan, payout_policy
        )

    return SimulationResult(
        years=years, months=months, events=events, final=state,
        cpf_life=cpf_life, ra_at_payout=ra_at_payout,
    )
