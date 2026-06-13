def test_tax_estimate(client):
    r = client.post("/tax/estimate", json={"income": 100000, "deduction": 15300})
    assert r.status_code == 200
    b = r.json()
    assert b["estimated_tax_saved"] > 0
    assert b["marginal_rate"] == 0.115  # 100k band


def test_tax_estimate_zero_deduction(client):
    r = client.post("/tax/estimate", json={"income": 100000})
    assert r.json()["estimated_tax_saved"] == 0.0
