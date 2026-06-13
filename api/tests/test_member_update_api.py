def _p():
    return {
        "name": "A",
        "dob": "1986-01-01",
        "monthly_gross_wage": 6000,
        "employment_status": "employee",
        "balances": {"OA": 1, "SA": 2, "MA": 3, "RA": 0},
    }


def test_put_updates_balances(client):
    mid = client.post("/members", json=_p()).json()["id"]
    r = client.put(f"/members/{mid}", json={"balances": {"OA": 50000, "SA": 30000, "MA": 20000, "RA": 0}})
    assert r.status_code == 200
    assert r.json()["balances"]["OA"] == 50000
    # persisted
    assert client.get(f"/members/{mid}").json()["balances"]["SA"] == 30000


def test_put_partial_name_only(client):
    mid = client.post("/members", json=_p()).json()["id"]
    r = client.put(f"/members/{mid}", json={"name": "Renamed"})
    assert r.json()["name"] == "Renamed"
    assert r.json()["balances"]["MA"] == 3  # unchanged


def test_put_missing_404(client):
    assert client.put("/members/99999", json={"name": "x"}).status_code == 404


def test_delete_removes_member_and_runs(client):
    mid = client.post("/members", json=_p()).json()["id"]
    client.post(f"/members/{mid}/simulate", json={"end_age": 41})  # create a run
    r = client.delete(f"/members/{mid}")
    assert r.status_code == 204
    assert client.get(f"/members/{mid}").status_code == 404
    assert client.get(f"/members/{mid}/simulations").json() == []


def test_delete_missing_404(client):
    assert client.delete("/members/99999").status_code == 404
