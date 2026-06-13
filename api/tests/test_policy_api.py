def test_get_active_policy(client):
    r = client.get("/policy/active?year=2026")
    assert r.status_code == 200
    body = r.json()
    assert body["effective_year"] == 2026
    assert body["frs"] == 220400
    assert body["status"] == "active"


def test_create_draft_then_approve(client):
    payload = {
        "effective_year": 2027, "frs": 228200, "brs": 114100,
        "ers": 456400, "bhs": 81400, "cpf_life_eligibility_min": 60000,
        "ordinary_wage_ceiling": 8000, "additional_wage_ceiling": 102000,
        "contribution_rates": {}, "allocation_rates": {}, "interest_rates": {},
    }
    r = client.post("/policy/snapshots", json=payload)
    assert r.status_code == 201
    snap = r.json()
    assert snap["status"] == "draft"

    r2 = client.post(f"/policy/snapshots/{snap['id']}/approve")
    assert r2.status_code == 200
    assert r2.json()["status"] == "active"

    r3 = client.get("/policy/active?year=2027")
    assert r3.json()["frs"] == 228200


def test_approve_archives_same_year_active(client):
    payload = {
        "effective_year": 2026, "frs": 999999, "brs": 1, "ers": 1, "bhs": 1,
        "cpf_life_eligibility_min": 60000, "ordinary_wage_ceiling": 8000,
        "additional_wage_ceiling": 102000,
        "contribution_rates": {}, "allocation_rates": {}, "interest_rates": {},
    }
    new_id = client.post("/policy/snapshots", json=payload).json()["id"]
    client.post(f"/policy/snapshots/{new_id}/approve")
    active = client.get("/policy/active?year=2026").json()
    assert active["frs"] == 999999  # newest active wins; old one archived
