def test_health_timing_reports_db_roundtrip(client):
    r = client.get("/health/timing")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert isinstance(body["db_roundtrip_ms"], (int, float))
    assert body["db_roundtrip_ms"] >= 0


def test_active_policy_is_edge_cacheable(client):
    year = 2026
    r = client.get(f"/policy/active?year={year}")
    assert r.status_code == 200
    cc = r.headers.get("cache-control", "")
    assert "s-maxage=300" in cc
    assert "stale-while-revalidate" in cc


def test_member_data_is_not_cached(client):
    """Per-member data must never carry a public edge-cache header."""
    body = {"name": "NoCache", "dob": "1990-04-10", "monthly_gross_wage": 6000,
            "employment_status": "employee",
            "balances": {"OA": 1000, "SA": 1000, "MA": 1000, "RA": 0}}
    mid = client.post("/members", json=body).json()["id"]
    r = client.get(f"/members/{mid}")
    assert "s-maxage" not in r.headers.get("cache-control", "")
