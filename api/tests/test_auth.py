def _member():
    return {
        "name": "A", "dob": "1986-01-01", "monthly_gross_wage": 6000,
        "employment_status": "employee",
        "balances": {"OA": 1, "SA": 2, "MA": 3, "RA": 0},
    }


def test_login_success_returns_token(anon_client):
    r = anon_client.post("/auth/login", json={"username": "useradmin", "password": "P@ssw0rd2022"})
    assert r.status_code == 200
    body = r.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]


def test_login_bad_password_401(anon_client):
    r = anon_client.post("/auth/login", json={"username": "useradmin", "password": "wrong"})
    assert r.status_code == 401


def test_login_bad_username_401(anon_client):
    r = anon_client.post("/auth/login", json={"username": "nope", "password": "P@ssw0rd2022"})
    assert r.status_code == 401


def test_create_member_public(anon_client):
    # Any user may create their own client profile (no admin).
    assert anon_client.post("/members", json=_member()).status_code == 201


def test_delete_member_requires_auth(client, anon_client):
    mid = client.post("/members", json=_member()).json()["id"]
    assert anon_client.delete(f"/members/{mid}").status_code == 401


def test_update_member_public_but_special_access_admin_only(client, anon_client):
    mid = anon_client.post("/members", json=_member()).json()["id"]
    # public edit of own values works
    assert anon_client.put(f"/members/{mid}", json={"name": "x"}).status_code == 200
    # special_access cannot be self-granted by a non-admin
    anon_client.put(f"/members/{mid}", json={"special_access": True})
    assert anon_client.get(f"/members/{mid}").json()["special_access"] is False


def test_member_password_gate(anon_client):
    mid = anon_client.post("/members", json={**_member(), "password": "secret1"}).json()["id"]
    # has_password is visible from the roster, but the profile itself is gated
    rows = {r["id"]: r for r in anon_client.get("/members").json()}
    assert rows[mid]["has_password"] is True
    assert anon_client.get(f"/members/{mid}").status_code == 401  # protected
    # correct password mints an access token that unlocks the profile
    r = anon_client.post(f"/members/{mid}/verify-password", json={"password": "secret1"})
    assert r.json()["ok"] is True
    tok = r.json()["token"]
    assert anon_client.get(f"/members/{mid}", headers={"Authorization": f"Bearer {tok}"}).status_code == 200
    assert anon_client.post(f"/members/{mid}/verify-password", json={"password": "nope"}).json()["ok"] is False


def test_public_can_read_and_simulate(client, anon_client):
    mid = client.post("/members", json=_member()).json()["id"]
    assert anon_client.get("/members").status_code == 200
    assert anon_client.get(f"/members/{mid}").status_code == 200
    assert anon_client.post(f"/members/{mid}/simulate", json={"end_age": 41}).status_code in (200, 201)


def test_login_then_use_token(anon_client):
    tok = anon_client.post(
        "/auth/login", json={"username": "useradmin", "password": "P@ssw0rd2022"}
    ).json()["access_token"]
    r = anon_client.post("/members", json=_member(), headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 201


def test_invalid_token_rejected_on_delete(client, anon_client):
    mid = client.post("/members", json=_member()).json()["id"]
    r = anon_client.delete(
        f"/members/{mid}", headers={"Authorization": "Bearer garbage.token.here"}
    )
    assert r.status_code == 401
