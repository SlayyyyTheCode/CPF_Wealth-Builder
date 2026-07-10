"""Input guardrails: reject absurd or hostile values at the schema layer.

Unbounded end_age was a CPU-DoS vector (end_age=100000 -> ~1.2M-iteration
Decimal loop per request); unbounded wages/balances produced garbage
projections and oversized rows. All must 422 before touching the engine.
"""


def _member(**over):
    body = {
        "name": "Guard", "dob": "1985-04-10",
        "monthly_gross_wage": 6000, "employment_status": "employee",
        "balances": {"OA": 1000, "SA": 1000, "MA": 1000, "RA": 0},
    }
    body.update(over)
    return body


def _create(client):
    r = client.post("/members", json=_member())
    assert r.status_code == 201
    return r.json()["id"]


# ── simulate: end_age is the DoS lever ────────────────────────────────────────
def test_simulate_rejects_huge_end_age(client):
    mid = _create(client)
    r = client.post(f"/members/{mid}/simulate", json={"end_age": 100000, "persist": False})
    assert r.status_code == 422


def test_simulate_rejects_negative_end_age(client):
    mid = _create(client)
    r = client.post(f"/members/{mid}/simulate", json={"end_age": -5, "persist": False})
    assert r.status_code == 422


def test_simulate_normal_end_age_still_works(client):
    mid = _create(client)
    r = client.post(f"/members/{mid}/simulate", json={"end_age": 90, "persist": False})
    assert r.status_code == 200


# ── member create: wage / balances / name bounds ─────────────────────────────
def test_create_rejects_negative_wage(client):
    assert client.post("/members", json=_member(monthly_gross_wage=-100)).status_code == 422


def test_create_rejects_absurd_wage(client):
    assert client.post("/members", json=_member(monthly_gross_wage=10_000_000)).status_code == 422


def test_create_rejects_negative_balance(client):
    assert client.post(
        "/members", json=_member(balances={"OA": -1, "SA": 0, "MA": 0, "RA": 0})
    ).status_code == 422


def test_create_rejects_empty_name(client):
    assert client.post("/members", json=_member(name="")).status_code == 422


def test_create_rejects_giant_name(client):
    assert client.post("/members", json=_member(name="x" * 10_000)).status_code == 422


def test_create_rejects_absurd_bonus_months(client):
    assert client.post("/members", json=_member(bonus_months=1000)).status_code == 422


def test_create_rejects_absurd_increment(client):
    # 5.0 = +500%/yr salary growth — overflow generator, not a raise
    assert client.post("/members", json=_member(salary_increment_pct=5.0)).status_code == 422


def test_create_normal_member_still_works(client):
    assert client.post("/members", json=_member(bonus_months=2, salary_increment_pct=0.03)).status_code == 201


# ── analysis: same levers ─────────────────────────────────────────────────────
def test_analysis_rejects_huge_end_age(client):
    mid = _create(client)
    r = client.post(f"/members/{mid}/analysis", json={"end_age": 100000})
    assert r.status_code == 422


def test_analysis_rejects_negative_income(client):
    mid = _create(client)
    r = client.post(f"/members/{mid}/analysis", json={"annual_assessable_income": -1})
    assert r.status_code == 422
