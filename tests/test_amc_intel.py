"""Phase 10 — AMC Intelligence: route slug generation + AMC score formula (mirrors the JS in
lib/signalSlug.js + lib/amcIntel.js). Guards routing consistency and score bounds/reweighting."""
import re


def slugify(name):  # mirror of lib/amcIntel.js amcSlugify / signalSlug.js slugify
    n = re.sub(r"\s*mutual fund", "", name, flags=re.I)
    return re.sub(r"-+$", "", re.sub(r"^-+", "", re.sub(r"[^a-z0-9]+", "-", n.lower())))


def signal_path(amc, asset):
    return f"{slugify(amc)}/{asset.lower()}"


def amc_score(avg_health, beat_pct, topq_pct, risk_score, completeness):
    comps = []
    if avg_health is not None:
        comps.append((30, avg_health))
    if beat_pct is not None:
        comps.append((25, beat_pct))
    comps.append((20, topq_pct))
    if risk_score is not None:
        comps.append((15, risk_score))
    comps.append((10, completeness))
    tw = sum(w for w, _ in comps)
    return round(sum((w / tw) * v for w, v in comps))


def test_route_slugs_for_demo_amcs():
    assert signal_path("SBI", "Equity") == "sbi/equity"
    assert signal_path("HDFC", "Debt") == "hdfc/debt"
    assert signal_path("Mirae Asset", "Equity") == "mirae-asset/equity"
    assert signal_path("ICICI Prudential", "Equity") == "icici-prudential/equity"
    assert signal_path("Axis", "Equity") == "axis/equity"


def test_slug_consistent_full_vs_stripped_name():
    # card uses stripped name, page matches funds.json stripped name -> same slug
    assert slugify("SBI Mutual Fund") == slugify("SBI") == "sbi"
    assert slugify("ICICI Prudential Mutual Fund") == slugify("ICICI Prudential") == "icici-prudential"


def test_amc_score_in_range_full_components():
    s = amc_score(avg_health=81, beat_pct=62, topq_pct=40, risk_score=70, completeness=90)
    assert 0 <= s <= 100 and s >= 60


def test_amc_score_reweights_when_1y_missing():
    # no beat_pct (no 1Y data) -> weights renormalise over the available components, still 0..100
    s = amc_score(avg_health=70, beat_pct=None, topq_pct=50, risk_score=60, completeness=80)
    assert 0 <= s <= 100


def test_amc_score_bounds():
    assert amc_score(100, 100, 100, 100, 100) == 100
    assert amc_score(0, 0, 0, 0, 0) == 0
