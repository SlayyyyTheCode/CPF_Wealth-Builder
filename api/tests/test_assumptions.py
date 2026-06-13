def test_active_snapshot_exposes_assumptions(db_session):
    from app.models.policy import PolicySnapshot
    from app.engines.policy_resolver import snapshot_to_policy
    snap = db_session.query(PolicySnapshot).filter_by(effective_year=2026).one()
    p = snapshot_to_policy(snap)
    a = p["assumptions"]
    assert a["readiness"]["w_sum"] == 0.7
    assert a["growth"]["sum_rate"] == 0.035
    assert a["cpf_life"]["deferral_cap"] == 0.35


def test_snapshot_to_policy_falls_back_when_assumptions_none(db_session):
    from app.models.policy import PolicySnapshot
    from app.engines.policy_resolver import snapshot_to_policy
    snap = db_session.query(PolicySnapshot).filter_by(effective_year=2026).one()
    snap.assumptions = None
    p = snapshot_to_policy(snap)
    assert p["assumptions"]["readiness"]["w_ma"] == 0.3  # fallback to ASSUMPTIONS_2026
