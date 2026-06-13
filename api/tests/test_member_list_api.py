def _payload(name="Lim"):
    return {"name": name, "dob": "1986-01-01", "monthly_gross_wage": 6000,
            "employment_status": "employee",
            "balances": {"OA": 50000, "SA": 30000, "MA": 20000, "RA": 0}}


def test_list_members_empty(client):
    assert client.get("/members").json() == []


def test_list_members_summary_shape(client):
    client.post("/members", json=_payload("Lim"))
    client.post("/members", json=_payload("Nurul"))
    rows = client.get("/members").json()
    assert len(rows) == 2
    row = rows[0]
    assert set(row) >= {"id", "name", "dob", "employment_status", "current_total", "latest_run"}
    assert row["current_total"] == 100000.0   # 50000+30000+20000+0
    assert row["latest_run"] is None          # not yet simulated


def test_list_includes_latest_run_after_simulate(client):
    mid = client.post("/members", json={
        "name": "Lim", "dob": "1972-01-01", "monthly_gross_wage": 6000,
        "employment_status": "employee",
        "balances": {"OA": 100000, "SA": 150000, "MA": 60000, "RA": 0}}).json()["id"]
    client.post(f"/members/{mid}/simulate", json={"end_age": 90})
    row = next(r for r in client.get("/members").json() if r["id"] == mid)
    assert row["latest_run"] is not None
    assert "readiness" in row["latest_run"]
    assert "cpf_life_monthly" in row["latest_run"]
