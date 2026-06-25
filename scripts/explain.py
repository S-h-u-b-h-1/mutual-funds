"""
Deterministic explanation engine (no LLM, no opinions). Turns ranking movement into
what / why / why-it-matters, every statement citing metric + previous + current value.

Movement signal: a fund's rank by 1-month return vs its rank by 3-month return within its
category cohort. A fund ranked far higher on 1-month than 3-month is accelerating (climber);
the reverse is decelerating (faller). Decile crossings are flagged. All real, all traceable.
"""

from __future__ import annotations

from statistics import mean


def _rank_map(members, key):
    """scheme_code -> (rank, percentile) by `key` desc. rank 1 = best."""
    ranked = sorted(members, key=lambda f: f[key], reverse=True)
    n = len(ranked)
    return {f["code"]: (i + 1, round(100 * (1 - i / n))) for i, f in enumerate(ranked)}, n


def fund_movements(funds, min_cohort=10):
    """Per-category 1M-vs-3M rank movement for equity Growth funds. Returns list of dicts."""
    cats = {}
    for f in funds:
        if (f.get("assetClass") == "Equity" and f.get("isGrowth") and not f.get("isIdcw")
                and f.get("r1m") is not None and f.get("r3m") is not None):
            cats.setdefault(f["category"], []).append(f)
    out = []
    for cat, members in cats.items():
        if len(members) < min_cohort:
            continue
        r1, n = _rank_map(members, "r1m")
        r3, _ = _rank_map(members, "r3m")
        for f in members:
            rank1, pct1 = r1[f["code"]]
            rank3, pct3 = r3[f["code"]]
            out.append({"code": f["code"], "name": f["name"], "amc": f["amc"], "category": cat,
                        "n": n, "rank1m": rank1, "rank3m": rank3, "pct1m": pct1, "pct3m": pct3,
                        "rank_change": rank3 - rank1, "r1m": f["r1m"], "r3m": f["r3m"]})
    return out


def _short(n):
    import re
    return re.sub(r" - (Direct|Regular).*", "", n)


def explain_funds(movements, limit=6):
    """High-value explained intelligence items (Phase 1 + 7 noise suppression)."""
    items = []
    seen = set()  # one item per fund (collapse Direct/Regular plan duplicates)

    def fresh(m):
        k = _short(m["name"]).strip().lower()
        if k in seen:
            return False
        seen.add(k)
        return True

    enter = [m for m in movements if m["pct1m"] >= 90 and m["pct3m"] < 90]
    exitd = [m for m in movements if m["pct3m"] >= 90 and m["pct1m"] < 90]
    climbers = sorted([m for m in movements if m["rank_change"] >= 15], key=lambda m: -m["rank_change"])
    fallers = sorted([m for m in movements if m["rank_change"] <= -15], key=lambda m: m["rank_change"])

    for m in sorted(enter, key=lambda m: m["rank1m"]):
        if len([i for i in items if i["type"] == "enter_top_decile"]) >= limit or not fresh(m):
            continue
        items.append({
            "type": "enter_top_decile", "entity_type": "fund", "entity_id": m["code"],
            "title": f"{_short(m['name'])[:40]} entered the top decile",
            "what": f"Now top-10% in {m['category']} on 1-month NAV return.",
            "why": f"Category rank improved from #{m['rank3m']} (3-month) to #{m['rank1m']} (1-month) of {m['n']}.",
            "care": "Recent momentum is accelerating — monitor for sustained outperformance.",
            "metric": "category rank (3M→1M)", "previous_value": f"#{m['rank3m']}", "current_value": f"#{m['rank1m']}",
            "severity": "positive", "value": "actionable"})
    for m in sorted(exitd, key=lambda m: m["rank1m"], reverse=True):
        if len([i for i in items if i["type"] == "exit_top_decile"]) >= max(1, limit // 2) or not fresh(m):
            continue
        items.append({
            "type": "exit_top_decile", "entity_type": "fund", "entity_id": m["code"],
            "title": f"{_short(m['name'])[:40]} left the top decile",
            "what": f"No longer top-10% in {m['category']} on 1-month NAV return.",
            "why": f"Category rank slipped from #{m['rank3m']} (3-month) to #{m['rank1m']} (1-month) of {m['n']}.",
            "care": "Medium-term leader is cooling — review before adding.",
            "metric": "category rank (3M→1M)", "previous_value": f"#{m['rank3m']}", "current_value": f"#{m['rank1m']}",
            "severity": "caution", "value": "actionable"})
    for m in climbers:
        if len([i for i in items if i["type"] == "climber"]) >= max(1, limit // 2) or m in enter or not fresh(m):
            continue
        items.append({
            "type": "climber", "entity_type": "fund", "entity_id": m["code"],
            "title": f"{_short(m['name'])[:40]} is climbing its category",
            "what": f"Up {m['rank_change']} places in {m['category']} on recent momentum.",
            "why": f"Category rank #{m['rank3m']} (3-month) → #{m['rank1m']} (1-month) of {m['n']}.",
            "care": "Improving relative momentum — a watchlist candidate.",
            "metric": "category rank (3M→1M)", "previous_value": f"#{m['rank3m']}", "current_value": f"#{m['rank1m']}",
            "severity": "positive", "value": "interesting"})
    return items[:limit]


def rotation(funds, kind, key, min_n):
    """Category or AMC momentum: rank by avg 1M vs avg 3M; movement = rotation."""
    groups = {}
    for f in funds:
        if (f.get("assetClass") == "Equity" and f.get("isGrowth") and not f.get("isIdcw")
                and f.get("r1m") is not None and f.get("r3m") is not None):
            groups.setdefault(f[key], []).append(f)
    rows = [{"name": g, "avg1m": mean(x["r1m"] for x in m), "avg3m": mean(x["r3m"] for x in m), "n": len(m)}
            for g, m in groups.items() if len(m) >= min_n]
    by1 = {r["name"]: i + 1 for i, r in enumerate(sorted(rows, key=lambda r: -r["avg1m"]))}
    by3 = {r["name"]: i + 1 for i, r in enumerate(sorted(rows, key=lambda r: -r["avg3m"]))}
    out = []
    for r in rows:
        mv = by3[r["name"]] - by1[r["name"]]
        out.append({"kind": kind, "name": r["name"], "rank1m": by1[r["name"]], "rank3m": by3[r["name"]],
                    "rank_change": mv, "avg1m": round(r["avg1m"], 2), "avg3m": round(r["avg3m"], 2),
                    "severity": "positive" if mv > 0 else "caution" if mv < 0 else "info"})
    out.sort(key=lambda r: -abs(r["rank_change"]))
    return out
