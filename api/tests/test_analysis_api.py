def _retiree_payload():
    return {
        "name": "Lim", "dob": "1972-01-01",
        "monthly_gross_wage": 6000, "employment_status": "employee",
        "balances": {"OA": 100000, "SA": 150000, "MA": 60000, "RA": 0},
    }


def test_analysis_returns_scenarios_and_strategies(client):
    mid = client.post("/members", json=_retiree_payload()).json()["id"]
    r = client.post(f"/members/{mid}/analysis", json={
        "annual_assessable_income": 100000,
        "property_pledge_eligible": True,
        "payout_age": 65, "end_age": 90,
    })
    assert r.status_code == 200
    body = r.json()
    assert set(body["scenarios"].keys()) == {"below_brs", "property_pledge", "ers_optimisation"}
    assert body["scenarios"]["property_pledge"]["eligible"] is True
    assert "ers_topup_needed" in body["scenarios"]["ers_optimisation"]
    assert isinstance(body["strategies"], list)


def test_analysis_missing_member_404(client):
    assert client.post("/members/99999/analysis", json={"annual_assessable_income": 50000}).status_code == 404


def test_tax_relief_endpoint(client):
    r = client.post("/tax/relief", json={
        "income": 100000, "rstu_self": 8000, "rstu_family": 0, "voluntary_cpf": 0,
    })
    assert r.status_code == 200
    body = r.json()
    assert body["relief_earned"] == 8000.0
    assert body["estimated_tax_saved"] == 920.0
    assert body["marginal_rate"] == 0.115
