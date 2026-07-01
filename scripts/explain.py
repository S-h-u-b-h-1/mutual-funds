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
        cat_avg = round(mean(x["r1m"] for x in members), 2)        # category context
        for f in members:
            rank1, pct1 = r1[f["code"]]
            rank3, pct3 = r3[f["code"]]
            out.append({"code": f["code"], "name": f["name"], "amc": f["amc"], "category": cat,
                        "n": n, "rank1m": rank1, "rank3m": rank3, "pct1m": pct1, "pct3m": pct3,
                        "rank_change": rank3 - rank1, "r1m": f["r1m"], "r3m": f["r3m"], "cat_avg": cat_avg})
    return out


import re

from scripts.canonical import canonical_key


def _short(n):
    return re.sub(r" - (Direct|Regular).*", "", n)


def attention_score(m, novelty):
    """0-100. Novelty (decile crossing) + magnitude (rank jump) + persistence (3-month base)
    + category deviation (fund-specific alpha vs the cohort average). Deterministic."""
    magnitude = min(40, abs(m["rank_change"]) * 2)
    persistence = 15 if m["pct3m"] >= 50 else 8 if m["pct3m"] >= 30 else 0
    cat_deviation = min(15, round(max(0.0, m["r1m"] - m["cat_avg"]) * 3))
    return min(100, novelty + magnitude + persistence + cat_deviation)


def _context(m):
    """Is the move fund-specific or category-wide? (Context Layer Phase 1/4.)"""
    ca, r = m["cat_avg"], m["r1m"]
    if r - ca >= max(1.0, abs(ca)):
        return f"{m['category']} averaged {ca:+.1f}% over 1M, this fund {r:+.1f}% — outperformance appears fund-specific."
    if ca >= 1.0:
        return f"The whole {m['category']} category averaged {ca:+.1f}% (fund {r:+.1f}%) — a category-wide move."
    return f"Fund {r:+.1f}% vs {m['category']} average {ca:+.1f}% over 1 month."


def _tier(s):
    return "High" if s >= 70 else "Medium" if s >= 45 else "Low"


def attention_candidates(movements):
    """Every fund with an attention-worthy movement pattern (decile cross or 15+ rank jump),
    each with its own real, non-fabricated attentionScore. Deliberately NOT computed for funds
    outside these patterns — a fund with no notable movement has no attention score, not a
    score of 0 (0 would wrongly imply 'measured and found unremarkable' rather than 'not the
    kind of signal this model measures'). Used both for the homepage top-N and, unfiltered, to
    persist a per-fund score onto every qualifying fund in funds.json (fund-page Phase 6)."""
    cands = []
    for m in movements:
        if m["pct1m"] >= 90 and m["pct3m"] < 90:
            novelty, typ, sev = 30, "enter_top_decile", "positive"
            title = f"{_short(m['name'])[:40]} entered the top decile"
            what = f"Now top-10% in {m['category']} on 1-month NAV return."
            why = f"Category rank improved from #{m['rank3m']} (3-month) to #{m['rank1m']} (1-month) of {m['n']}."
            care = "Recent momentum is accelerating — monitor for sustained outperformance."
        elif m["pct3m"] >= 90 and m["pct1m"] < 90:
            novelty, typ, sev = 30, "exit_top_decile", "caution"
            title = f"{_short(m['name'])[:40]} left the top decile"
            what = f"No longer top-10% in {m['category']} on 1-month NAV return."
            why = f"Category rank slipped from #{m['rank3m']} (3-month) to #{m['rank1m']} (1-month) of {m['n']}."
            care = "Medium-term leader is cooling — review before adding."
        elif m["rank_change"] >= 15:
            novelty, typ, sev = 0, "climber", "positive"
            title = f"{_short(m['name'])[:40]} is climbing its category"
            what = f"Up {m['rank_change']} places in {m['category']} on recent momentum."
            why = f"Category rank #{m['rank3m']} (3-month) → #{m['rank1m']} (1-month) of {m['n']}."
            care = "Improving relative momentum — a watchlist candidate."
        elif m["rank_change"] <= -15:
            novelty, typ, sev = 10, "faller", "caution"
            title = f"{_short(m['name'])[:40]} is losing momentum"
            what = f"Down {abs(m['rank_change'])} places in {m['category']} on recent momentum."
            why = f"Category rank #{m['rank3m']} (3-month) → #{m['rank1m']} (1-month) of {m['n']}."
            care = "Relative momentum deteriorating — reassess."
        else:
            continue
        s = attention_score(m, novelty)
        cands.append({"type": typ, "entity_type": "fund", "entity_id": m["code"], "canonical": canonical_key(m["name"]),
                      "category": m["category"], "title": title, "what": what, "why": why, "care": care, "context": _context(m),
                      "metric": "category rank (3M→1M)", "previous_value": f"#{m['rank3m']}", "current_value": f"#{m['rank1m']}",
                      "severity": sev, "attentionScore": s, "value": _tier(s)})

    return [c for c in cands if c["value"] != "Low"]                        # Phase 7/8 suppression


def explain_funds(movements, limit=6):
    """Homepage top-N: same candidates, deduped by canonical fund + capped 2-per-category for
    diversity (a single hot category shouldn't crowd out every other signal on the homepage)."""
    cands = attention_candidates(movements)
    best, cat_count, seen = [], {}, set()
    for c in sorted(cands, key=lambda c: -c["attentionScore"]):             # dedup by canonical + category diversity
        if c["canonical"] in seen or cat_count.get(c["category"], 0) >= 2:
            continue
        seen.add(c["canonical"])
        cat_count[c["category"]] = cat_count.get(c["category"], 0) + 1
        best.append(c)
    out = sorted(best, key=lambda c: -c["attentionScore"])[:limit]
    for c in out:
        c.pop("canonical", None)
        c.pop("category", None)
    return out


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
