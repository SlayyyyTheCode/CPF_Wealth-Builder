"""The SA must not hold a balance after it closes at 55.

The SA closes at the 55th birthday (form_ra). But interest ACCRUED in the SA
during the months before that birthday is only credited at year end — and was
being posted straight back into the now-closed SA, leaving a phantom balance
that then compounded at 4% forever. It must follow the closure instead: into
the RA up to the retirement sum, then the OA.
"""
from decimal import Decimal

from app.engines.domain import AccountState
from app.engines.interest import apply_credit
from app.policy.seed import SEED_2026

POLICY = {
    "bhs": Decimal("79000"), "frs": Decimal("220400"),
    "interest_rates": SEED_2026["interest_rates"],
}
Z = Decimal("0")


def _acc(**kw):
    d = {"OA": Z, "SA": Z, "MA": Z, "RA": Z}
    d.update({k: Decimal(str(v)) for k, v in kw.items()})
    return d


def test_sa_interest_after_closure_does_not_stay_in_sa():
    # SA already closed (form_ra ran), but it accrued $5,000 of interest first.
    state = AccountState(OA=Decimal("10000"), SA=Z, MA=Z, RA=Decimal("100000"))
    new, *_ , ma_ovf = apply_credit(state, _acc(SA=5000), _acc(), 55, POLICY)
    assert new.SA == Z, f"phantom SA balance: {new.SA}"
    # It followed the closure: RA has room below the FRS, so it lands there.
    assert new.RA == Decimal("105000")


def test_sa_interest_after_closure_spills_to_oa_when_ra_is_full():
    state = AccountState(OA=Decimal("10000"), SA=Z, MA=Z, RA=Decimal("220400"))
    new, *_ = apply_credit(state, _acc(SA=5000), _acc(), 55, POLICY)
    assert new.SA == Z
    assert new.RA == Decimal("220400")          # already at the FRS
    assert new.OA == Decimal("15000")           # spills to the OA


def test_under_55_sa_interest_still_credits_to_sa():
    """Regression: below 55 the SA is open and keeps its own interest."""
    state = AccountState(OA=Z, SA=Decimal("50000"), MA=Z, RA=Z)
    new, *_ = apply_credit(state, _acc(SA=2000), _acc(), 40, POLICY)
    assert new.SA == Decimal("52000")


def test_full_projection_has_no_phantom_sa_after_55(client):
    """End-to-end: a mid-year 55th birthday must leave SA at zero."""
    body = {"name": "Mid55", "dob": "1971-06-15", "monthly_gross_wage": 8000,
            "employment_status": "employee",
            "balances": {"OA": 50000, "SA": 300000, "MA": 20000, "RA": 0}}
    mid = client.post("/members", json=body).json()["id"]
    r = client.post(f"/members/{mid}/simulate", json={"end_age": 60, "persist": False})
    for y in r.json()["result"]["years"]:
        if y["age"] >= 55:
            assert y["closing"]["SA"] == 0, f"phantom SA {y['closing']['SA']} at age {y['age']}"
