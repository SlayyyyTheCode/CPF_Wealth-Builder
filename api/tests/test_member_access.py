"""Server-side authorization for password-protected member profiles.

A member with a password is private: their data requires either an admin token
or a member-access token issued on a correct password. Members without a
password stay open (public), preserving existing behaviour.
"""

def _member(name="Protected", password=None):
    body = {
        "name": name, "dob": "1985-04-10",
        "monthly_gross_wage": 6000, "employment_status": "employee",
        "balances": {"OA": 50000, "SA": 30000, "MA": 20000, "RA": 0},
    }
    if password:
        body["password"] = password
    return body


def _create(client, **kw):
    r = client.post("/members", json=_member(**kw))
    assert r.status_code == 201, r.text
    return r.json()["id"]


# ── open (no password) members stay public ───────────────────────────────────
def test_open_member_readable_by_anon(client, anon_client):
    mid = _create(client, name="Open")
    assert anon_client.get(f"/members/{mid}").status_code == 200


# ── protected members require access ─────────────────────────────────────────
def test_protected_member_blocks_anon(client, anon_client):
    mid = _create(client, name="Secret", password="hunter2")
    assert anon_client.get(f"/members/{mid}").status_code == 401


def test_protected_member_admin_can_read(client):
    mid = _create(client, name="Secret", password="hunter2")
    assert client.get(f"/members/{mid}").status_code == 200


def test_verify_password_issues_token_and_grants_access(client, anon_client):
    mid = _create(client, name="Secret", password="hunter2")
    r = anon_client.post(f"/members/{mid}/verify-password", json={"password": "hunter2"})
    assert r.status_code == 200 and r.json()["ok"] is True
    token = r.json()["token"]
    assert token
    h = {"Authorization": f"Bearer {token}"}
    assert anon_client.get(f"/members/{mid}", headers=h).status_code == 200


def test_wrong_password_no_token(client, anon_client):
    mid = _create(client, name="Secret", password="hunter2")
    r = anon_client.post(f"/members/{mid}/verify-password", json={"password": "nope"})
    assert r.json()["ok"] is False
    assert r.json()["token"] is None


def test_member_token_scoped_to_its_member(client, anon_client):
    a = _create(client, name="A", password="aaa")
    b = _create(client, name="B", password="bbb")
    tok_a = anon_client.post(f"/members/{a}/verify-password", json={"password": "aaa"}).json()["token"]
    # A's token must not open B
    h = {"Authorization": f"Bearer {tok_a}"}
    assert anon_client.get(f"/members/{b}", headers=h).status_code == 403


# ── projection endpoints are gated too ───────────────────────────────────────
def test_simulate_blocked_for_protected_anon(client, anon_client):
    mid = _create(client, name="Secret", password="hunter2")
    assert anon_client.post(f"/members/{mid}/simulate", json={}).status_code == 401


def test_analysis_blocked_for_protected_anon(client, anon_client):
    mid = _create(client, name="Secret", password="hunter2")
    assert anon_client.post(f"/members/{mid}/analysis", json={}).status_code == 401


def test_simulate_allowed_with_member_token(client, anon_client):
    mid = _create(client, name="Secret", password="hunter2")
    tok = anon_client.post(f"/members/{mid}/verify-password", json={"password": "hunter2"}).json()["token"]
    h = {"Authorization": f"Bearer {tok}"}
    r = anon_client.post(f"/members/{mid}/simulate", json={"end_age": 90, "persist": False}, headers=h)
    assert r.status_code == 200, r.text


# ── roster masks protected totals from anon ──────────────────────────────────
def test_list_masks_protected_totals_for_anon(client, anon_client):
    _create(client, name="Open")
    _create(client, name="Secret", password="hunter2")
    rows = {r["name"]: r for r in anon_client.get("/members").json()}
    assert rows["Open"]["current_total"] == 100000
    assert rows["Secret"]["current_total"] == 0      # masked
    assert rows["Secret"]["latest_run"] is None
    assert rows["Secret"]["has_password"] is True
