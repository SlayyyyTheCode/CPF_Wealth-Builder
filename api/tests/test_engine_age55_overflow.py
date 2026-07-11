"""Age-55 RA formation must be visible in overflow_out, not just in events.

At 55 the SA closes: it fills the RA up to the FRS and ANY EXCESS SPILLS TO
THE OA, where it keeps earning the OA rate + extra interest. If the SA cannot
reach the FRS, the OA tops the RA up. Both flows move real money into/out of
the OA, so any OA projection that reconstructs the balance from overflow_out
needs them — previously they were emitted only as events and were invisible
to the API response.
"""


def _member(client, oa, sa, ma=20000):
    body = {
        "name": "A55", "dob": "1971-06-15",  # turns 55 within the projection
        "monthly_gross_wage": 6000, "employment_status": "employee",
        "balances": {"OA": oa, "SA": sa, "MA": ma, "RA": 0},
    }
    r = client.post("/members", json=body)
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _year(client, mid, age):
    r = client.post(f"/members/{mid}/simulate", json={"end_age": 60, "persist": False})
    assert r.status_code == 200, r.text
    return next(y for y in r.json()["result"]["years"] if y["age"] == age)


def test_sa_excess_over_frs_spills_to_oa_at_55(client):
    """SA well above the FRS: the excess must appear as sa_to_oa."""
    mid = _member(client, oa=50_000, sa=300_000)   # FRS 220,400 -> ~80k excess
    y55 = _year(client, mid, 55)
    assert y55["overflow_out"]["sa_to_oa"] > 50_000, y55["overflow_out"]
    # the SA covered the FRS on its own, so no OA was drawn on
    assert y55["overflow_out"]["oa_to_ra"] == 0


def test_oa_tops_up_ra_when_sa_short_of_frs(client):
    """SA below the FRS: the OA must be drawn on, and that shows as oa_to_ra."""
    mid = _member(client, oa=200_000, sa=50_000)   # SA far below FRS
    y55 = _year(client, mid, 55)
    assert y55["overflow_out"]["oa_to_ra"] > 100_000, y55["overflow_out"]
    # The SA had nothing left over at closure. (sa_to_oa may still be non-zero:
    # with the RA now AT the FRS, each month's SA/RA slice correctly spills to
    # the OA — that is routing overflow, not the closure.)


def test_oa_untouched_when_sa_alone_meets_frs(client):
    """The user's case: SA covers the FRS, so the OA is never swept."""
    mid = _member(client, oa=100_000, sa=250_000)
    y55 = _year(client, mid, 55)
    assert y55["overflow_out"]["oa_to_ra"] == 0
    assert y55["overflow_out"]["sa_to_oa"] > 0
