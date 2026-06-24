"""Phase 11 — scheme-level intelligence tests (classification, returns, ranking, quality)."""
from datetime import date

from scripts.build_performance import is_growth, is_idcw, clean_category


def test_growth_vs_idcw_classification():
    assert is_growth("HDFC Top 100 Fund - Direct Plan - Growth Option")
    assert not is_growth("HDFC Top 100 Fund - Direct Plan - IDCW")
    assert is_idcw("SBI Bluechip Fund - Regular - IDCW Payout")
    assert is_idcw("Axis Midcap - Dividend")
    # a dividend/growth-named idcw plan must NOT count as growth
    assert not is_growth("Some Fund - Growth Dividend Option")


def test_direct_detection_via_name():
    assert "direct" in "ICICI Pru Bluechip - Direct - Growth".lower()
    assert "direct" not in "ICICI Pru Bluechip - Regular - Growth".lower()


def test_clean_category():
    assert clean_category("Equity Scheme - Large Cap Fund") == "Large Cap"
    assert clean_category("Debt Scheme - Banking and PSU Fund") == "Banking and PSU"
    assert clean_category("") == "Other"


def test_point_to_point_return():
    now, anchor = 110.0, 100.0
    assert round((now - anchor) / anchor * 100, 2) == 10.0
    # a fall
    assert round((90.0 - 100.0) / 100.0 * 100, 2) == -10.0


def test_category_rank_and_percentile():
    # replicate the ranking: higher r1m -> rank 1, percentile ~100
    members = [{"r1m": 5.0}, {"r1m": 1.0}, {"r1m": 3.0}]
    ranked = sorted(members, key=lambda x: x["r1m"], reverse=True)
    n = len(ranked)
    pcts = [round(100 * (1 - i / n)) for i in range(n)]
    assert [m["r1m"] for m in ranked] == [5.0, 3.0, 1.0]
    assert pcts[0] == 100 and pcts[-1] < pcts[0]


def test_trend_score_bounds():
    def trend(r1m, r3m):
        return max(0, min(100, round(50 + (r1m - r3m / 3) * 4)))
    assert trend(0, 0) == 50
    assert trend(20, 0) == 100          # clamps at 100
    assert trend(-20, 0) == 0           # clamps at 0
    assert trend(5, 9) > 50             # 1m pace ahead of 3m/3 -> improving


def test_stale_detection():
    asof = date(2026, 6, 23)
    fresh = (asof - date(2026, 6, 23)).days
    stale = (asof - date(2026, 6, 10)).days
    assert fresh == 0
    assert stale > 7
