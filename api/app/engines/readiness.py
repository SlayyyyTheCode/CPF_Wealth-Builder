from decimal import Decimal, ROUND_HALF_UP

ONE = Decimal("1")
W_SUM = Decimal("0.7")
W_MA = Decimal("0.3")


def compute_readiness(ra_at_55: Decimal, frs_at_55: Decimal,
                      ma_at_55: Decimal, bhs_at_55: Decimal,
                      weights=None, bands=None) -> dict:
    """Rule-based 0-100 retirement readiness. 70% RA-vs-FRS, 30% MA-vs-BHS.

    Optional *weights* dict may supply ``w_sum`` and/or ``w_ma`` to override the
    module-level constants.  Optional *bands* dict may supply ``on_track`` and/or
    ``below_frs_pace`` thresholds.  When absent the current defaults are used so
    all existing call-sites are unaffected.
    """
    w_sum = Decimal(str((weights or {}).get("w_sum", 0.7)))
    w_ma = Decimal(str((weights or {}).get("w_ma", 0.3)))
    on_track = (bands or {}).get("on_track", 70)
    below = (bands or {}).get("below_frs_pace", 40)

    c1 = min(ra_at_55 / frs_at_55, ONE) if frs_at_55 else ONE
    c2 = min(ma_at_55 / bhs_at_55, ONE) if bhs_at_55 else ONE
    score = int((Decimal("100") * (w_sum * c1 + w_ma * c2)).to_integral_value(rounding=ROUND_HALF_UP))
    band = "on_track" if score >= on_track else "below_frs_pace" if score >= below else "below_brs"
    return {"score": score, "band": band}
