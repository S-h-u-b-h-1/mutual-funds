"""Institutional research sprint guards: benchmark resolver expansion (index-name derivation +
category standards) and the knowledge graph. No network. Run: pytest tests/test_research_readiness.py"""
import json
from pathlib import Path

from ingestion.benchmarks import resolve_benchmark, derive_index_benchmark

WH = Path(__file__).resolve().parents[1] / "data" / "warehouse"


def test_index_name_derivation():
    # An index fund's benchmark is the index named in the scheme — derived, not fabricated.
    assert derive_index_benchmark("UTI Nifty 50 Index Fund") == "NIFTY 50 TRI"
    assert derive_index_benchmark("Motilal Oswal Nifty Next 50 Index Fund") == "NIFTY Next 50 TRI"
    assert derive_index_benchmark("SBI Nifty 500 Index Fund") == "NIFTY 500 TRI"
    assert derive_index_benchmark("Nippon India ETF Nifty Bank") == "NIFTY Bank TRI"
    assert derive_index_benchmark("HDFC Sensex ETF") == "S&P BSE SENSEX TRI"
    assert derive_index_benchmark("Axis Gold ETF") == "Domestic Price of Gold"
    # "nifty 50" must not leak into "nifty 500"
    assert derive_index_benchmark("Nifty 500 Index Fund") == "NIFTY 500 TRI"


def test_new_category_standards():
    assert resolve_benchmark("Dynamic Asset Allocation or Balanced Advantage", "", "Hybrid")[0]
    assert resolve_benchmark("Gilt with 10 year constant duration", "", "Debt")[0] == "CRISIL 10 Year Gilt Index"
    assert resolve_benchmark("Balanced Hybrid", "", "Hybrid")[0]


def test_resolver_still_returns_none_when_genuinely_varies():
    # FoF / multi-asset with no index in the name → honest None, never a guess.
    assert resolve_benchmark("FoF Domestic", "Some FoF Scheme", "Other")[0] is None
    assert resolve_benchmark("Multi Asset Allocation", "XYZ Multi Asset Fund", "Hybrid")[0] is None


def test_benchmark_coverage_improved():
    k = json.load(open(WH / "coverage_kpis.json"))
    assert k["benchmark_coverage_pct"] >= 85, "benchmark coverage should be raised well above the old 40%"


def test_knowledge_graph_entities_and_queries():
    g = json.load(open(WH / "knowledge_graph.json"))
    e = g["entities"]
    assert e["funds"] > 14000 and e["amcs"] > 30 and e["benchmarks"] > 30
    ex = g["examples"]
    # relationships must actually resolve (universe-wide ones non-empty)
    assert ex["funds_benchmarked_to_NIFTY_50_TRI"], "benchmark→funds edge broken"
    assert "manager" in ex["funds_managed_by_<top_manager>"]
