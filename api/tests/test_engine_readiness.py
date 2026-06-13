from decimal import Decimal
from app.engines.readiness import compute_readiness

FRS = Decimal("220400"); BHS = Decimal("79000")


def test_full_frs_and_bhs_scores_100():
    r = compute_readiness(FRS, FRS, BHS, BHS)
    assert r == {"score": 100, "band": "on_track"}


def test_half_frs_no_ma():
    # c1 = 0.5 (*0.7=0.35), c2 = 0 -> score 35 -> below_brs
    r = compute_readiness(FRS / 2, FRS, Decimal("0"), BHS)
    assert r["score"] == 35
    assert r["band"] == "below_brs"


def test_band_edges():
    # score exactly 70 (on_track): full FRS, zero MA -> 0.7*1*100 = 70
    assert compute_readiness(FRS, FRS, Decimal("0"), BHS)["score"] == 70
    assert compute_readiness(FRS, FRS, Decimal("0"), BHS)["band"] == "on_track"


def test_caps_do_not_exceed_one():
    r = compute_readiness(FRS * 2, FRS, BHS * 2, BHS)
    assert r["score"] == 100
