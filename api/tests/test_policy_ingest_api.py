def test_ingest_returns_extracted_diff_carried(client):
    files = {"file": ("policy.pdf", b"%PDF-1.4 fake", "application/pdf")}
    r = client.post("/policy/ingest", files=files)
    assert r.status_code == 200
    body = r.json()
    # fixture extractor returns effective_year 2027, frs 228200
    assert body["extracted"]["frs"] == 228200
    assert len(body["diff"]) == 8  # CORE_FIELDS
    frs_row = next(d for d in body["diff"] if d["field"] == "frs")
    assert frs_row["current"] == 220400.0 and frs_row["extracted"] == 228200
    assert frs_row["changed"] is True
    assert "contribution_rates" in body["carried_forward"]


def test_snapshots_list_returns_seeded(client):
    rows = client.get("/policy/snapshots").json()
    assert any(r["effective_year"] == 2026 and r["status"] == "active" for r in rows)
    assert {"id", "effective_year", "status", "created_at", "approved_at"} <= set(rows[0])
