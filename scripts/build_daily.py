"""
Daily "what changed since yesterday" bundle (Phase 1 / retention digest).

Real 1-day NAV movers (r1d) + today's leaders + any deterministic insights accrued by the
daily-intelligence engine. Written to frontend/app/data/daily.json for the homepage. No
fabrication — movers are real 1-day NAV returns.

    .venv/bin/python -m scripts.build_daily
"""

from __future__ import annotations

import json
import os
from collections import defaultdict
from statistics import mean

from scripts.explain import fund_movements, explain_funds, attention_candidates, rotation

WH = "data/warehouse"

# Market Breadth Engine (Phase 2, terminal sprint) — real GICS-style equity sectors from
# metadata.json's sector_allocation (152-fund factsheet subset — same coverage limitation as
# marketImpact.js's SECTOR_MAP on the frontend; deliberately excludes debt-issuer-named "sectors"
# like individual bank names, which aren't real equity sectors).
REAL_SECTORS = [
    "Financial Services", "Information Technology", "Healthcare", "Consumer Durables",
    "Fast Moving Consumer Goods", "Capital Goods", "Automobile And Auto Components",
    "Oil, Gas & Consumable Fuels", "Metals & Mining", "Telecommunication",
]
SECTOR_MIN_ALLOCATION = 15.0  # % — only count a fund toward a sector if meaningfully exposed to it


def sector_leadership(funds_by_code, metadata_rows):
    """Real, deterministic: for each major equity sector, the average 1M return of funds with
    >=15% factsheet-disclosed allocation to it. Honestly scoped to the metadata subset — returns
    an empty list entry (not a fabricated 0) for a sector with no qualifying funds."""
    by_sector = defaultdict(list)
    for m in metadata_rows:
        f = funds_by_code.get(str(m.get("scheme_code")))
        if not f or f.get("r1m") is None:
            continue
        for s in (m.get("sector_allocation") or []):
            if s.get("sector") in REAL_SECTORS and (s.get("allocation_pct") or 0) >= SECTOR_MIN_ALLOCATION:
                by_sector[s["sector"]].append(f["r1m"])
    rows = [{"sector": s, "avg1m": round(mean(v), 2), "fundCount": len(v)} for s, v in by_sector.items() if v]
    rows.sort(key=lambda r: -r["avg1m"])
    return rows


def volatility_regime(eq):
    """Market-wide volatility tier from the SAME thresholds already established per-category
    (categories/[category]/page.js: Low<12, Moderate<20, High<30, else Very High) — applied here
    at the whole-market level. No fabricated historical baseline to compare against (none exists
    yet — see docs/FUND_HISTORY_ENGINE.md); this is a real snapshot tier, not a "regime change"
    claim, which would need a real time-series to support."""
    vols = [f["vol90"] for f in eq if f.get("vol90") is not None]
    if not vols:
        return {"avgVol": None, "tier": None}
    avg = round(mean(vols), 1)
    tier = "Low" if avg < 12 else "Moderate" if avg < 20 else "High" if avg < 30 else "Very High"
    return {"avgVol": avg, "tier": tier}


def slim(f):
    return {"code": f["code"], "name": f["name"], "amc": f["amc"], "category": f["category"],
            "r1d": f.get("r1d"), "r1m": f.get("r1m")}


def main():
    d = json.load(open("frontend/app/data/funds.json"))
    funds = list(d["funds"].values())
    asof = d["asOf"]
    eq = [f for f in funds if f.get("assetClass") == "Equity" and f.get("isGrowth") and not f.get("isIdcw") and f.get("r1d") is not None]
    eq.sort(key=lambda f: f["r1d"], reverse=True)
    r1ds = [f["r1d"] for f in eq]

    # Market Breadth Engine additions (Phase 2, terminal sprint) — sector leadership + volatility
    # regime; metadata.json is optional (schemes_populated may be 0 if it hasn't been ingested
    # yet in this environment — sector_leadership() degrades to an honest empty list, never fakes it)
    metadata_rows = []
    if os.path.exists("frontend/app/data/metadata.json"):
        metadata_rows = json.load(open("frontend/app/data/metadata.json")).get("metadata", [])
    funds_by_code = {f["code"]: f for f in funds}

    by_cat, by_amc = defaultdict(list), defaultdict(list)
    for f in eq:
        if f.get("r1m") is not None:
            by_cat[f["category"]].append(f["r1m"])
            by_amc[f["amc"]].append(f["r1m"])
    top_cat = max(by_cat.items(), key=lambda kv: mean(kv[1]))[0] if by_cat else None
    top_amc = max(((a, v) for a, v in by_amc.items() if len(v) >= 3), key=lambda kv: mean(kv[1]), default=(None, []))[0]
    top_fund = max((f for f in eq if f.get("r1m") is not None), key=lambda f: f["r1m"], default=None)

    # accrued deterministic insights (from the daily-intelligence engine), latest day only
    insights = []
    p = f"{WH}/intelligence.jsonl"
    if os.path.exists(p):
        rows = [json.loads(l) for l in open(p) if l.strip()]
        if rows:
            latest = max(r["intelligence_date"] for r in rows)
            insights = [{"type": r["intelligence_type"], "title": r["title"], "summary": r["summary"], "severity": r["severity"]}
                        for r in rows if r["intelligence_date"] == latest][:8]

    # ---- explanation engine (Phase 1) + ranking movement (Phase 2) ----
    movements = fund_movements(funds)
    explained = explain_funds(movements, limit=6)

    # Per-fund attention score (Phase 6, complete-workflows sprint): every fund with an
    # attention-worthy movement gets a real score persisted onto its OWN funds.json record, not
    # just the homepage's top-6. A fund with no qualifying movement gets none of these fields —
    # never a fabricated 0, which would wrongly claim "measured, nothing found" (see
    # attention_candidates' docstring). Written back into the SAME funds.json this script read.
    attn_by_code = {c["entity_id"]: c for c in attention_candidates(movements)}
    attn_updated = 0
    for code, rec in d["funds"].items():
        c = attn_by_code.get(code)
        if c:
            rec["attentionScore"] = c["attentionScore"]
            rec["attentionTier"] = c["value"]
            rec["attentionReason"] = c["why"]
            attn_updated += 1
        else:
            rec.pop("attentionScore", None); rec.pop("attentionTier", None); rec.pop("attentionReason", None)
    with open("frontend/app/data/funds.json", "w") as fh:
        json.dump(d, fh, separators=(",", ":"))
    cat_rot_full = rotation(funds, "category", "category", 5)
    amc_mom_full = rotation(funds, "amc", "amc", 5)
    cat_rot, amc_mom = cat_rot_full[:5], amc_mom_full[:5]
    sectors = sector_leadership(funds_by_code, metadata_rows)
    vol_regime = volatility_regime(eq)

    # ---- industry intelligence (Phase 7): market-level context ----
    breadth1d = round(100 * sum(1 for x in r1ds if x > 0) / len(r1ds)) if r1ds else 0
    breadth1m = round(100 * sum(1 for f in eq if (f.get("r1m") or 0) > 0) / len(eq)) if eq else 0
    imp_cats = round(100 * sum(1 for c in cat_rot_full if c["avg1m"] > 0) / len(cat_rot_full)) if cat_rot_full else 0
    imp_amcs = round(100 * sum(1 for a in amc_mom_full if a["avg1m"] > 0) / len(amc_mom_full)) if amc_mom_full else 0
    regime = "Risk-On" if breadth1d >= 55 else "Risk-Off" if breadth1d < 45 else "Neutral"
    stmts = [f"{sum(1 for x in r1ds if x > 0)} of {len(r1ds)} equity funds rose today ({breadth1d}% breadth) → {regime}.",
             f"{imp_cats}% of equity categories and {imp_amcs}% of AMCs are positive on 1-month NAV."]
    gaining = [c for c in cat_rot_full if c["rank_change"] > 0][:1]
    fading = [c for c in cat_rot_full if c["rank_change"] < 0][-1:]
    if gaining:
        stmts.append(f"{gaining[0]['name']} leadership strengthening (category rank #{gaining[0]['rank3m']}→#{gaining[0]['rank1m']} on 1M-vs-3M).")
    if fading:
        stmts.append(f"{fading[0]['name']} weakening (category rank #{fading[0]['rank3m']}→#{fading[0]['rank1m']}).")
    # AMC-level leadership narrative (Phase 7 market story) — same rank-movement pattern as
    # categories above, using amc_mom_full which was already computed but never surfaced as prose.
    amc_gaining = [a for a in amc_mom_full if a["rank_change"] > 0][:1]
    amc_fading = [a for a in amc_mom_full if a["rank_change"] < 0][-1:]
    if amc_gaining:
        stmts.append(f"{amc_gaining[0]['name']} gained market leadership (AMC rank #{amc_gaining[0]['rank3m']}→#{amc_gaining[0]['rank1m']} by avg 1M NAV return among peers, 1M-vs-3M).")
    if amc_fading:
        stmts.append(f"{amc_fading[0]['name']} lost ground (AMC rank #{amc_fading[0]['rank3m']}→#{amc_fading[0]['rank1m']}).")
    industry = {"riskRegime": regime, "breadth1d": breadth1d, "breadth1m": breadth1m,
                "improvingCategoriesPct": imp_cats, "improvingAmcsPct": imp_amcs, "statements": stmts}

    # rank-snapshot accrual (true day-over-day rankings build up over time)
    os.makedirs(WH, exist_ok=True)
    with open(f"{WH}/rank_snapshots.jsonl", "a") as fh:
        for m in movements:
            fh.write(json.dumps({"snapshot_date": asof, "code": m["code"], "category": m["category"],
                                 "rank1m": m["rank1m"], "n": m["n"]}) + "\n")

    brief = {
        "winners": [slim(f) for f in eq[:3]], "losers": [slim(f) for f in eq[-3:][::-1]],
        "category_rotation": cat_rot[:3], "amc_movement": amc_mom[:3],
        "risk": [i for i in explained if i["severity"] == "caution"][:3],
    }

    out = {
        "asOf": asof,
        "advancers": sum(1 for x in r1ds if x > 0), "decliners": sum(1 for x in r1ds if x < 0),
        "breadth1d": round(100 * sum(1 for x in r1ds if x > 0) / len(r1ds)) if r1ds else None,
        "gainers": [slim(f) for f in eq[:6]],
        "fallers": [slim(f) for f in eq[-6:][::-1]],
        "topFund": slim(top_fund) if top_fund else None,
        "topCategory": top_cat, "topAmc": top_amc,
        "insights": insights, "explained": explained,
        "categoryRotation": cat_rot, "amcMomentum": amc_mom, "brief": brief, "industry": industry,
        "marketBreadth": {
            "categoryRotationFull": cat_rot_full, "amcMomentumFull": amc_mom_full,
            "sectorLeadership": sectors, "volatilityRegime": vol_regime,
            "sectorCoverageNote": f"Sector leadership covers {len(metadata_rows)} factsheet-parsed schemes only — a real but partial subset of the {len(funds)}-scheme universe.",
        },
    }
    with open("frontend/app/data/daily.json", "w") as fh:
        json.dump(out, fh, separators=(",", ":"))
    print(f"-- daily.json: {out['advancers']} up / {out['decliners']} down (breadth {out['breadth1d']}%) | "
          f"{len(explained)} explained items, {len(cat_rot)} cat-rotations, {len(amc_mom)} amc-moves | "
          f"attention scores persisted on {attn_updated} funds")


if __name__ == "__main__":
    main()
