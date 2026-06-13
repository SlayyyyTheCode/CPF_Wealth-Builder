from decimal import Decimal
from app.engines.policy_resolver import (
    GrowthAssumptions, project_policy, make_db_resolver,
)

BASE = {
    "ow_ceiling": Decimal("8000"), "aw_ceiling": Decimal("102000"),
    "frs": Decimal("220400"), "brs": Decimal("110200"),
    "ers": Decimal("440800"), "bhs": Decimal("79000"),
    "contribution_rates": {"<=35": 0.37}, "allocation_rates": {}, "interest_rates": {},
}


def test_project_policy_exp_zero_unchanged():
    p = project_policy(BASE, 2026, 2026, GrowthAssumptions())
    assert p["frs"] == Decimal("220400")
    assert p["bhs"] == Decimal("79000")


def test_project_policy_grows_sums_and_bhs():
    g = GrowthAssumptions(sum_rate=Decimal("0.035"), bhs_rate=Decimal("0.045"))
    p = project_policy(BASE, 2026, 2030, g)        # exp = 4
    exp_frs = (Decimal("220400") * (Decimal("1.035") ** 4)).quantize(Decimal("0.01"))
    exp_bhs = (Decimal("79000") * (Decimal("1.045") ** 4)).quantize(Decimal("0.01"))
    assert p["frs"] == exp_frs
    assert p["bhs"] == exp_bhs
    assert p["ow_ceiling"] == Decimal("8000")      # ceilings unchanged
    assert p["contribution_rates"] == {"<=35": 0.37}


def test_resolver_without_growth_unchanged(db_session):
    resolve = make_db_resolver(db_session)
    assert resolve(2030)["frs"] == Decimal("220400")


def test_resolver_with_growth_projects_upward(db_session):
    g = GrowthAssumptions()
    resolve = make_db_resolver(db_session, g)
    p = resolve(2030)
    assert p["frs"] > Decimal("220400")
    # 2026 (base year) stays at the snapshot value
    assert resolve(2026)["frs"] == Decimal("220400")
