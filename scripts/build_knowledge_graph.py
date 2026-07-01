"""
Knowledge Graph — canonical entities + queryable relationships from data already in hand.

Entities: funds, AMCs, categories, benchmarks (universe-wide, from AMFI) + managers, companies,
sectors (from factsheet metadata, currently SBI). Relationships are plain inverted indices so
questions like "every fund managed by X" / "every fund holding Reliance" / "every AMC with Banking
exposure" are O(1) lookups. No fabrication — an edge exists only if the underlying data does.

Run: .venv/bin/python -m scripts.build_knowledge_graph  → data/warehouse/knowledge_graph.json
"""
from __future__ import annotations

import json
import os
import re
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WH = os.path.join(ROOT, "data", "warehouse")


def canon_manager(raw: str):
    """Split a manager string into canonical people (dedupe spelling/title variants)."""
    out = []
    for part in re.split(r"&|,|\band\b", raw or ""):
        n = re.sub(r"\*|Mr\.|Ms\.|Mrs\.|Dr\.", "", part).strip()
        n = re.sub(r"\s{2,}", " ", n)
        if len(n) > 2:
            out.append(n)
    return out


def slug(s):
    return re.sub(r"^-+|-+$", "", re.sub(r"[^a-z0-9]+", "-", (s or "").lower()))


def main():
    funds = json.load(open(os.path.join(ROOT, "frontend/app/data/funds.json")))["funds"]
    metas = {str(m["scheme_code"]): m for m in json.load(open(os.path.join(ROOT, "frontend/app/data/metadata.json")))["metadata"]}

    by_amc, by_cat, by_bench = defaultdict(list), defaultdict(list), defaultdict(list)
    by_manager, by_company, sector_amcs = defaultdict(set), defaultdict(set), defaultdict(set)
    managers, companies, sectors = {}, set(), set()

    for code, f in funds.items():
        if f.get("amc"):
            by_amc[f["amc"]].append(code)
        if f.get("category") and f["category"] != "Other":
            by_cat[f["category"]].append(code)
        if f.get("benchmark"):
            by_bench[f["benchmark"]].append(code)
        m = metas.get(code)
        if not m:
            continue
        for person in canon_manager(m.get("fund_manager") or ""):
            s = slug(person)
            managers[s] = person
            by_manager[s].add(code)
        for h in (m.get("holdings") or []):
            nm = (h.get("name") or "").strip()
            if nm:
                companies.add(nm)
                by_company[nm].add(code)
        for s in (m.get("sector_allocation") or []):
            sec = (s.get("sector") or "").strip()
            if sec:
                sectors.add(sec)
                sector_amcs[sec].add(f["amc"])

    entities = {
        "funds": len(funds), "amcs": len(by_amc), "categories": len(by_cat),
        "benchmarks": len(by_bench), "managers": len(managers),
        "companies": len(companies), "sectors": len(sectors),
    }
    coverage = {
        "amc_edges": "universe (100%)", "category_edges": "universe", "benchmark_edges": "universe (90%)",
        "manager_edges": f"factsheet — {sum(1 for c in funds if metas.get(c) and metas[c].get('fund_manager'))} funds",
        "holdings_edges": f"factsheet — {sum(1 for c in funds if metas.get(c) and metas[c].get('holdings'))} funds",
    }

    # Example queries answered from the graph (proof the relationships work).
    def funds_by_manager(name):
        s = slug(name)
        return [funds[c]["name"] for c in list(by_manager.get(s, []))[:8]]
    def funds_holding(company):
        hit = [c for k, v in by_company.items() if company.lower() in k.lower() for c in v]
        return [funds[c]["name"] for c in hit[:8]]
    def amcs_with_sector(sector):
        return sorted({a for k, v in sector_amcs.items() if sector.lower() in k.lower() for a in v})
    def funds_by_benchmark(b):
        return [funds[c]["name"] for c in by_bench.get(b, [])[:8]]

    sample_manager = max(managers.values(), key=lambda n: len(by_manager[slug(n)])) if managers else None
    examples = {
        "funds_managed_by_<top_manager>": {"manager": sample_manager, "funds": funds_by_manager(sample_manager) if sample_manager else []},
        "funds_holding_Reliance": funds_holding("Reliance"),
        "amcs_with_Banking_exposure": amcs_with_sector("Bank"),
        "funds_benchmarked_to_NIFTY_50_TRI": funds_by_benchmark("NIFTY 50 TRI"),
    }

    graph = {
        "entities": entities, "coverage": coverage, "examples": examples,
        # trimmed relationship indices (top entities) so the artifact stays portable
        "top_amcs_by_funds": dict(sorted(((a, len(v)) for a, v in by_amc.items()), key=lambda x: -x[1])[:15]),
        "top_benchmarks_by_funds": dict(sorted(((b, len(v)) for b, v in by_bench.items()), key=lambda x: -x[1])[:15]),
        "managers": {s: {"name": managers[s], "funds": len(by_manager[s])} for s in managers},
    }
    os.makedirs(WH, exist_ok=True)
    json.dump(graph, open(os.path.join(WH, "knowledge_graph.json"), "w"), indent=1)
    print(f"knowledge graph: {entities}")
    print(f"example — funds by {sample_manager}: {len(examples['funds_managed_by_<top_manager>']['funds'])}; "
          f"holding Reliance: {len(examples['funds_holding_Reliance'])}; "
          f"AMCs w/ Banking: {len(examples['amcs_with_Banking_exposure'])}; "
          f"NIFTY 50 TRI funds (shown {len(examples['funds_benchmarked_to_NIFTY_50_TRI'])} of {len(by_bench.get('NIFTY 50 TRI', []))})")
    return graph


if __name__ == "__main__":
    main()
