def test_create_and_get_member(client):
    payload = {
        "name": "Tan Ah Kow", "dob": "1985-04-10",
        "monthly_gross_wage": 6000, "employment_status": "employee",
        "balances": {"OA": 50000, "SA": 30000, "MA": 20000, "RA": 0},
    }
    r = client.post("/members", json=payload)
    assert r.status_code == 201
    mid = r.json()["id"]

    r2 = client.get(f"/members/{mid}")
    assert r2.status_code == 200
    assert r2.json()["name"] == "Tan Ah Kow"
    assert r2.json()["balances"]["OA"] == 50000


def test_get_missing_member_404(client):
    assert client.get("/members/99999").status_code == 404
