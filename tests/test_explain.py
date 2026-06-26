"""Explanation engine tests — deterministic, traceable, deduped, noise-suppressed."""
from scripts.explain import fund_movements, explain_funds, rotation


def mkfund(code, r1m, r3m, cat="Test Cap", name=None):
    return {"code": code, "name": name or f"Fund {code} - Direct Plan - Growth", "amc": "X",
            "category": cat, "assetClass": "Equity", "isGrowth": True, "isIdcw": False, "r1m": r1m, "r3m": r3m}


# 12-fund cohort: fund "0" is best on 1M (rank 1) but worst on 3M (rank 12) -> enters top decile.
COHORT = [mkfund(str(i), r1m=20 - i, r3m=10 + i) for i in range(12)]


def test_fund_movements_ranks_and_change():
    mv = {m["code"]: m for m in fund_movements(COHORT, min_cohort=10)}
    assert mv["0"]["rank1m"] == 1 and mv["0"]["rank3m"] == 12
    assert mv["0"]["rank_change"] == 11            # climbed 11 places (3M->1M)
    assert mv["11"]["rank1m"] == 12 and mv["11"]["rank3m"] == 1


def test_explain_traceable_and_actionable():
    items = explain_funds(fund_movements(COHORT, min_cohort=10))
    top = next(i for i in items if i["entity_id"] == "0")
    assert top["type"] == "enter_top_decile"
    assert top["previous_value"] == "#12" and top["current_value"] == "#1"   # traceable
    assert top["value"] in ("High", "Medium") and top["attentionScore"] > 0  # scored + surfaced
    assert top["what"] and top["why"] and top["care"] and top["context"]     # what/why/care/context present


def test_explain_dedups_plan_variants():
    # same fund as Direct + Regular -> one explained item
    funds = [mkfund(str(i), r1m=20 - i, r3m=10 + i) for i in range(12)]
    funds.append(mkfund("0R", r1m=20, r3m=10, name="Fund 0 - Regular Plan - Growth"))
    items = explain_funds(fund_movements(funds, min_cohort=10))
    titles = [i["title"] for i in items]
    assert len(titles) == len(set(titles))         # no duplicate fund titles


def test_noise_suppressed_when_no_movement():
    # a flat cohort (1M rank == 3M rank for all) -> no decile crossings, no big climbers
    flat = [mkfund(str(i), r1m=20 - i, r3m=20 - i) for i in range(12)]
    assert explain_funds(fund_movements(flat, min_cohort=10)) == []


def test_rotation_detects_category_movement():
    funds = ([mkfund(str(i), r1m=10, r3m=2, cat="Hot") for i in range(6)] +
             [mkfund(f"b{i}", r1m=2, r3m=10, cat="Cold") for i in range(6)])
    rot = {r["name"]: r for r in rotation(funds, "category", "category", 5)}
    assert rot["Hot"]["rank1m"] == 1 and rot["Hot"]["rank3m"] == 2   # leads on 1M, trailed on 3M
    assert rot["Hot"]["rank_change"] > 0                              # rotating in


def test_deterministic():
    a = explain_funds(fund_movements(COHORT, 10))
    b = explain_funds(fund_movements(COHORT, 10))
    assert a == b


def test_canonical_collapses_variants():
    from scripts.canonical import canonical_key, canonical_display
    keys = {canonical_key(n) for n in [
        "SBI Small Cap Fund - Direct Plan - Growth",
        "SBI Small Cap Fund - Regular Plan - Growth",
        "SBI Small Cap Fund - Direct Plan - Income Distribution cum Capital Withdrawal Option (IDCW)",
        "SBI SMALL CAP FUND - REGULAR PLAN - IDCW",
    ]}
    assert len(keys) == 1                                   # 4 variants -> 1 canonical idea
    assert canonical_display("SBI Small Cap Fund - Direct Plan - Growth") == "SBI Small Cap Fund"


def test_attention_score_bounds_and_ordering():
    from scripts.explain import attention_score
    big = {"rank_change": 20, "pct3m": 60, "r1m": 8.0, "cat_avg": 2.0}
    small = {"rank_change": 2, "pct3m": 20, "r1m": 1.0, "cat_avg": 0.9}
    assert 0 <= attention_score(small, 0) <= 100
    assert attention_score(big, 30) > attention_score(small, 0)   # decile-crossing big move scores higher


def test_explain_dedup_is_canonical():
    # Direct + Regular of the SAME fund must collapse to one item even with different codes
    funds = [mkfund(str(i), r1m=20 - i, r3m=10 + i) for i in range(12)]
    funds.append(mkfund("0R", r1m=20, r3m=10, name="Fund 0 - Regular Plan - Growth"))
    items = explain_funds(fund_movements(funds, min_cohort=10))
    ids = [i["entity_id"] for i in items if "Fund 0" in i["title"]]
    assert len(ids) == 1                                   # one canonical fund, not two variants
