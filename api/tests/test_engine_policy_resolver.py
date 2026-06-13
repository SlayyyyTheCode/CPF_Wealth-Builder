from decimal import Decimal
from app.engines.policy_resolver import snapshot_to_policy, make_db_resolver


def test_snapshot_to_policy_maps_fields(db_session):
    from app.models.policy import PolicySnapshot
    snap = db_session.query(PolicySnapshot).first()
    p = snapshot_to_policy(snap)
    assert p["ow_ceiling"] == Decimal("8000")
    assert p["frs"] == Decimal("220400")
    assert p["bhs"] == Decimal("79000")
    assert p["contribution_rates"]["<=35"] == 0.37
    assert p["interest_rates"]["base"]["OA"] == 0.025


def test_resolver_returns_active_for_year(db_session):
    resolve = make_db_resolver(db_session)
    assert resolve(2026)["frs"] == Decimal("220400")


def test_resolver_carries_forward_when_year_missing(db_session):
    resolve = make_db_resolver(db_session)
    # only 2026 seeded; a later year carries the 2026 snapshot forward
    assert resolve(2030)["frs"] == Decimal("220400")
    # an earlier year falls back to the earliest active
    assert resolve(2000)["frs"] == Decimal("220400")
