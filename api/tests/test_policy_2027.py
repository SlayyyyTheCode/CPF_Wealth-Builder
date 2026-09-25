"""1 January 2027 CPF changes, plus policy carry-forward.

The official figures below were fetched and text-extracted from CPF's own PDFs
on 2026-09-25 (contribution + allocation tables effective 1 Jan 2027, the ERS
table on cpf.gov.sg). They are asserted literally so a future edit to the seed
that drifts from the published numbers fails loudly.
"""
from datetime import date, datetime, UTC
from decimal import Decimal

import pytest

from app.engines.domain import AccountState, SimulationInput
from app.engines.policy_resolver import make_db_resolver, snapshot_to_policy
from app.engines.simulation import run_simulation
from app.models.policy import PolicySnapshot
from app.policy.seed import SEED_2026, SEED_2027

UNCHANGED_BANDS = ["<=35", "35-45", "45-50", "50-55", "65-70", ">70"]
CHANGED_BANDS = ["55-60", "60-65"]


# ── the data itself ──────────────────────────────────────────────────────────
def test_2027_retirement_sums_are_the_official_figures():
    assert SEED_2027["ers"] == 456400          # official CPF table
    assert SEED_2027["frs"] == 228200
    assert SEED_2027["brs"] == 114100
    # CPF's fixed relationships: ERS = 2 x FRS = 4 x BRS
    assert SEED_2027["ers"] == 2 * SEED_2027["frs"] == 4 * SEED_2027["brs"]


def test_2027_contribution_rates_official():
    c = SEED_2027["contribution_rates"]
    assert c["55-60"] == 0.355     # was 34%
    assert c["60-65"] == 0.26      # was 25%
    for band in UNCHANGED_BANDS:
        assert c[band] == SEED_2026["contribution_rates"][band], band


def test_2027_allocation_ratios_official():
    a = SEED_2027["allocation_rates"]
    assert a["55-60"] == {"OA": 0.3382, "SAorRA": 0.3661, "MA": 0.2957}
    assert a["60-65"] == {"OA": 0.1347, "SAorRA": 0.4615, "MA": 0.4038}
    for band in UNCHANGED_BANDS:
        assert a[band] == SEED_2026["allocation_rates"][band], band
    for band, r in a.items():
        assert round(sum(r.values()), 4) == 1.0, band


def test_2027_ordinary_wage_ceiling_unchanged():
    # Stated as $8,000 in CPF's Jan-2027 contribution table.
    assert SEED_2027["ordinary_wage_ceiling"] == SEED_2026["ordinary_wage_ceiling"] == 8000


def test_2026_snapshot_untouched():
    assert SEED_2026["contribution_rates"]["55-60"] == 0.34
    assert SEED_2026["contribution_rates"]["60-65"] == 0.25
    assert SEED_2026["frs"] == 220400


@pytest.mark.parametrize("band", CHANGED_BANDS)
def test_the_whole_increase_goes_to_the_retirement_account(band):
    """CPF: the step-up is allocated to the RA (up to the FRS). So at the OW
    ceiling the OA and MA dollar amounts must be unchanged and the RA must
    absorb exactly the extra contribution."""
    ow = 8000.0
    def dollars(seed):
        t = ow * seed["contribution_rates"][band]
        r = seed["allocation_rates"][band]
        return {k: t * r[k] for k in ("OA", "SAorRA", "MA")}, t

    d26, t26 = dollars(SEED_2026)
    d27, t27 = dollars(SEED_2027)
    extra = t27 - t26
    assert extra > 0
    # ratios are published to 4dp, so allow $1 of rounding
    assert abs(d27["OA"] - d26["OA"]) < 1.0
    assert abs(d27["MA"] - d26["MA"]) < 1.0
    assert abs((d27["SAorRA"] - d26["SAorRA"]) - extra) < 1.0


# ── the resolver picks the right year ────────────────────────────────────────
def _add_2027(db):
    db.add(PolicySnapshot(**SEED_2027 | {
        "status": "active", "approved_at": datetime.now(UTC), "approved_by": "test",
    }))
    db.commit()


def test_resolver_applies_2027_rules_from_2027(db_session):
    _add_2027(db_session)
    resolve = make_db_resolver(db_session)
    assert resolve(2026)["contribution_rates"]["55-60"] == 0.34
    assert resolve(2026)["frs"] == Decimal("220400")
    for y in (2027, 2028, 2035):                       # carries forward after 2027
        assert resolve(y)["contribution_rates"]["55-60"] == 0.355
        assert resolve(y)["contribution_rates"]["60-65"] == 0.26
    assert resolve(2027)["frs"] == Decimal("228200")


def test_without_a_2027_snapshot_2026_rules_carry_forward(db_session):
    resolve = make_db_resolver(db_session)
    assert resolve(2030)["contribution_rates"]["55-60"] == 0.34


# ── end to end through the real engine ───────────────────────────────────────
def _run(db, dob):
    resolve = make_db_resolver(db)
    return run_simulation(
        SimulationInput(
            opening=AccountState(OA=Decimal(0), SA=Decimal(0), MA=Decimal(0), RA=Decimal(0)),
            dob=dob, monthly_gross_wage=Decimal("8000"),
            employment_status="employee", end_age=60, start_year=2026,
        ),
        resolve,
    )


def test_a_57_year_old_contributes_more_to_the_ra_from_2027(db_session):
    _add_2027(db_session)
    res = _run(db_session, date(1969, 6, 15))          # 57 in mid-2026, 55-60 band to 2029
    by_year = {y.year: y for y in res.years}
    y26, y27 = by_year[2026], by_year[2027]
    ra26 = y26.contribution_by_account["RA"]
    ra27 = y27.contribution_by_account["RA"]
    # 2027: full year at 35.5% -> RA share 8000*0.355*0.3661*12 ~ 12,477
    assert 12_400 < float(ra27) < 12_560, ra27
    # and materially above a full 2026-rate year (8000*0.34*0.3382*12 ~ 11,039)
    assert float(ra27) > 11_039 * 1.10
    # OA and MA dollar inflow is unchanged year-on-year (the increase is RA-only)
    assert abs(float(y27.contribution_by_account["OA"]) - 8000 * 0.34 * 0.353 * 12) < 60
    assert abs(float(y27.contribution_by_account["MA"]) - 8000 * 0.34 * 0.3088 * 12) < 60


def test_members_under_55_are_unaffected_by_the_2027_snapshot(db_session):
    """The step-up only touches the 55-65 bands — a 40-year-old projects the
    same with or without a 2027 snapshot."""
    without = _run(db_session, date(1986, 3, 1))
    _add_2027(db_session)
    with_ = _run(db_session, date(1986, 3, 1))
    a = {y.year: y.contribution_by_account for y in without.years if y.age < 55}
    b = {y.year: y.contribution_by_account for y in with_.years if y.age < 55}
    assert a == b


# ── policy endpoint carries forward instead of 404-ing ───────────────────────
def test_active_policy_endpoint_serves_2027_after_it_is_added(client, db_session):
    _add_2027(db_session)
    r = client.get("/policy/active?year=2027")
    assert r.status_code == 200
    assert r.json()["effective_year"] == 2027 and r.json()["frs"] == 228200
    assert client.get("/policy/active?year=2026").json()["frs"] == 220400


def test_active_policy_endpoint_carries_forward_instead_of_404(client):
    """1 Jan 2027 with no 2027 snapshot used to 404 every page that loads policy
    (the frontend asks for the current calendar year)."""
    r = client.get("/policy/active?year=2027")
    assert r.status_code == 200
    assert r.json()["effective_year"] == 2026          # newest snapshot <= 2027
    assert client.get("/policy/active?year=2040").json()["effective_year"] == 2026


def test_active_policy_before_first_snapshot_uses_the_earliest(client):
    r = client.get("/policy/active?year=2019")
    assert r.status_code == 200 and r.json()["effective_year"] == 2026
