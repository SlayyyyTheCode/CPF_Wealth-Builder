def _employee_payload():
    return {
        "name": "Tan Ah Kow", "dob": "1986-01-01",
        "monthly_gross_wage": 6000, "employment_status": "employee",
        "balances": {"OA": 0, "SA": 0, "MA": 0, "RA": 0},
    }


def test_simulate_persists_and_returns_run(client):
    mid = client.post("/members", json=_employee_payload()).json()["id"]

    r = client.post(f"/members/{mid}/simulate", json={"end_age": 41})
    assert r.status_code == 201
    body = r.json()
    assert body["id"] > 0
    assert body["member_id"] == mid
    assert body["result"]["final"]["OA"] == 15293.25
    assert body["result"]["final"]["SA"] == 5224.80
    assert body["result"]["final"]["MA"] == 6628.50


def test_list_runs_excludes_months(client):
    mid = client.post("/members", json=_employee_payload()).json()["id"]
    client.post(f"/members/{mid}/simulate", json={"end_age": 41})

    r = client.get(f"/members/{mid}/simulations")
    assert r.status_code == 200
    runs = r.json()
    assert len(runs) == 1
    assert "months" not in runs[0]
    assert runs[0]["final"]["OA"] == 15293.25


def test_get_single_run_includes_months(client):
    mid = client.post("/members", json=_employee_payload()).json()["id"]
    run_id = client.post(f"/members/{mid}/simulate", json={"end_age": 41}).json()["id"]

    r = client.get(f"/simulations/{run_id}")
    assert r.status_code == 200
    assert len(r.json()["result"]["months"]) == 12


def test_get_missing_run_404(client):
    assert client.get("/simulations/99999").status_code == 404


def test_simulate_self_employed_rejected_and_not_persisted(client):
    payload = _employee_payload() | {"employment_status": "self-employed"}
    mid = client.post("/members", json=payload).json()["id"]

    r = client.post(f"/members/{mid}/simulate", json={"end_age": 41})
    assert r.status_code == 422
    assert client.get(f"/members/{mid}/simulations").json() == []


def _retiree_payload():
    # born 1972 -> turns 55 in 2027, reaches 65 in 2037
    return {
        "name": "Lim", "dob": "1972-01-01",
        "monthly_gross_wage": 6000, "employment_status": "employee",
        "balances": {"OA": 100000, "SA": 150000, "MA": 60000, "RA": 0},
    }


def test_simulate_includes_cpf_life(client):
    mid = client.post("/members", json=_retiree_payload()).json()["id"]
    r = client.post(f"/members/{mid}/simulate",
                    json={"end_age": 66, "payout_age": 65, "cpf_life_plan": "Standard"})
    assert r.status_code == 201
    cpf_life = r.json()["result"]["cpf_life"]
    assert cpf_life["eligible"] is True
    assert cpf_life["monthly_payout"] > 0
    assert cpf_life["payout_age"] == 65


def test_growth_flag_changes_projection(client):
    mid = client.post("/members", json=_retiree_payload()).json()["id"]
    with_growth = client.post(
        f"/members/{mid}/simulate", json={"end_age": 66, "apply_growth": True}
    ).json()["result"]["cpf_life"]["monthly_payout"]
    no_growth = client.post(
        f"/members/{mid}/simulate", json={"end_age": 66, "apply_growth": False}
    ).json()["result"]["cpf_life"]["monthly_payout"]
    # growth raises FRS, so RA forms higher at 55 -> larger payout
    assert with_growth != no_growth


def test_simulate_result_includes_readiness(client):
    payload = {
        "name": "Lim", "dob": "1972-01-01", "monthly_gross_wage": 6000,
        "employment_status": "employee",
        "balances": {"OA": 100000, "SA": 150000, "MA": 60000, "RA": 0},
    }
    mid = client.post("/members", json=payload).json()["id"]
    r = client.post(f"/members/{mid}/simulate", json={"end_age": 90})
    body = r.json()["result"]
    assert "readiness" in body
    assert 0 <= body["readiness"]["score"] <= 100
    assert body["readiness"]["band"] in {"on_track", "below_frs_pace", "below_brs"}


def test_simulate_result_includes_milestones(client):
    mid = client.post("/members", json={
        "name": "Lim", "dob": "1972-01-01", "monthly_gross_wage": 6000,
        "employment_status": "employee",
        "balances": {"OA": 100000, "SA": 150000, "MA": 60000, "RA": 0}}).json()["id"]
    body = client.post(f"/members/{mid}/simulate", json={"end_age": 90}).json()["result"]
    assert set(body["milestones"]) == {"bhs_age", "frs_age", "ers_age", "cpf_life_eligible_age"}


def test_simulate_result_includes_medisave(client):
    mid = client.post("/members", json={
        "name": "Lim", "dob": "1972-01-01", "monthly_gross_wage": 6000,
        "employment_status": "employee",
        "balances": {"OA": 100000, "SA": 150000, "MA": 60000, "RA": 0}}).json()["id"]
    body = client.post(f"/members/{mid}/simulate", json={"end_age": 90}).json()["result"]
    md = body["medisave"]
    assert len(md["series"]) > 0
    assert "annual" in md["premiums"][0]
    assert md["adequate"] in (True, False)
    assert set(md) >= {"series", "premiums", "ma_at_85", "premium_at_85", "surplus_at_85", "adequate"}


# --- Phase 7 BE-2: override_balances + persist=False ---

def test_simulate_override_balances_no_persist_returns_id_zero(client):
    """simulate with override_balances + persist=false returns id=0 and does not write to DB."""
    mid = client.post("/members", json=_employee_payload()).json()["id"]

    # Get initial run count
    initial_runs = client.get(f"/members/{mid}/simulations").json()
    initial_count = len(initial_runs)

    r = client.post(
        f"/members/{mid}/simulate",
        json={
            "end_age": 91,
            "override_balances": {"OA": 999999, "SA": 0, "MA": 0, "RA": 0},
            "persist": False,
        },
    )
    assert r.status_code == 200, f"Expected 200 got {r.status_code}: {r.text}"
    body = r.json()
    assert body["id"] == 0, f"Expected id=0 for no-persist run, got {body['id']}"

    # No new row persisted
    after_runs = client.get(f"/members/{mid}/simulations").json()
    assert len(after_runs) == initial_count, (
        f"Expected {initial_count} runs but got {len(after_runs)} after no-persist simulate"
    )


def test_simulate_override_balances_result_has_interest_by_account(client):
    """Override + no-persist result must include interest_by_account in each year."""
    mid = client.post("/members", json=_employee_payload()).json()["id"]

    r = client.post(
        f"/members/{mid}/simulate",
        json={
            "end_age": 91,
            "override_balances": {"OA": 999999, "SA": 0, "MA": 0, "RA": 0},
            "persist": False,
        },
    )
    assert r.status_code == 200
    years = r.json()["result"]["years"]
    assert len(years) > 0
    assert "interest_by_account" in years[0], (
        f"interest_by_account missing from first year of override simulate"
    )
    for acct in ("OA", "SA", "MA", "RA"):
        assert acct in years[0]["interest_by_account"]


def test_simulate_persist_true_with_override_does_not_persist(client):
    """persist=True is overridden to False when override_balances is set — no DB write."""
    mid = client.post("/members", json=_employee_payload()).json()["id"]
    before_count = len(client.get(f"/members/{mid}/simulations").json())

    r = client.post(
        f"/members/{mid}/simulate",
        json={
            "end_age": 41,
            "override_balances": {"OA": 5000, "SA": 1000, "MA": 2000, "RA": 0},
            "persist": True,  # should be ignored when override_balances is set
        },
    )
    assert r.status_code == 200
    assert r.json()["id"] == 0

    after_count = len(client.get(f"/members/{mid}/simulations").json())
    assert after_count == before_count
