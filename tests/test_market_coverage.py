"""Market-coverage guards (2026-06-26 sprint). Validate the committed audit artifacts without
network: 100% of the live universe covered, all production gates pass, trust/KPIs well-formed,
and no fabricated metadata. Regenerate artifacts with: python -m scripts.market_coverage_audit"""
import json
from pathlib import Path

WH = Path(__file__).resolve().parents[1] / "data" / "warehouse"


def _load(name):
    return json.load(open(WH / name))


def test_industry_coverage_is_complete():
    d = _load("coverage_dashboard.json")
    assert d["coverage_pct"] == 100.0, f"coverage {d['coverage_pct']}% — schemes missing"
    assert d["missing_count"] == 0
    assert d["mfpulse_schemes"] >= d["live_amfi_schemes"], "our universe must be a superset of live AMFI"


def test_all_production_gates_pass():
    d = _load("production_validation.json")
    failed = [c["check"] for c in d["checks"] if not c["pass"]]
    assert not failed, f"failing production gates: {failed}"
    assert d["production_ready_pct"] == 100.0


def test_kpis_are_present_and_bounded():
    d = _load("coverage_kpis.json")
    for k, v in d.items():
        if k.endswith("_pct") or k.startswith("performance"):
            assert 0 <= v <= 100, f"{k}={v} out of range"
    assert d["scheme_coverage_pct"] == 100.0
    assert d["category_coverage_pct"] == 100.0


def test_trust_score_bounded():
    d = _load("trust_dashboard.json")
    assert 0 <= d["overall_trust_score"] <= 100
    assert d["coverage_score"] == 100.0 and d["routable_score"] == 100.0


def test_field_coverage_has_all_groups():
    d = _load("field_coverage.json")
    for group in ("Identity", "Performance", "Metadata", "Portfolio", "Documents"):
        assert group in d["fields"], f"missing field group {group}"
    # metadata coverage is honestly partial (factsheet-limited), not fabricated to look full
    assert d["fields"]["Metadata"]["Expense Ratio"]["universe_pct"] < 50


def test_acquisition_backlog_prioritised():
    d = _load("acquisition_backlog.json")
    assert d["items"], "backlog should not be empty while metadata is incomplete"
    impacts = [i["impact"] for i in d["items"]]
    order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    assert impacts == sorted(impacts, key=lambda x: order[x]), "backlog must be impact-ranked"
