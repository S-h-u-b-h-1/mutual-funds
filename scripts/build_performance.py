"""
Scheme-level performance + RISK intelligence from real AMFI NAV.

Builds two bundles (all traceable to AMFI NAV, no sample data):
  frontend/app/data/performance.json  — equity-Growth summaries (home/performance/categories)
  frontend/app/data/funds.json        — every active scheme: multi-window returns, category
                                        rank/percentile, daily-series risk metrics, trend, quality

Risk metrics come from a dense ~90-day daily NAV series (volatility, downside volatility,
max drawdown, negative-return days, consistency, momentum). Long windows (6m/1y/3y/5y) use
point-to-point anchor NAVs. Direct vs Regular are kept in separate peer cohorts; IDCW plans
are flagged. The Health Score itself is computed in the frontend (lib/fundHealth.js) from
these raw metrics, so there is a single source of truth for the model.

    .venv/bin/python -m scripts.build_performance
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.request
from datetime import date, datetime, timedelta
from statistics import mean, median, pstdev

from ingestion.amfi_parser import parse_file
from ingestion.benchmarks import resolve_benchmark

FRESH_MAX_DAYS = 7  # a NAV this old or newer counts as "active" / current; shared by every freshness gate below
REPORT = "https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx"
ANCHORS = [("r6m", 182), ("r1y", 365), ("r3y", 1095), ("r5y", 1825)]
DATA = "frontend/app/data"
SQRT252 = 252 ** 0.5


def is_growth(n):
    n = n.lower()
    return "growth" in n and not any(b in n for b in ("idcw", "dividend", "bonus", "payout"))


def is_idcw(n):
    n = n.lower()
    return any(b in n for b in ("idcw", "dividend", "bonus", "payout"))


def clean_category(cat):
    c = cat.split(" - ")[-1].strip() if " - " in cat else cat.strip()
    return c.replace(" Fund", "").replace("Scheme", "").strip() or "Other"


def _fetch_window(frm, to):
    # Retry up to 4 times on transient errors, AMFI rate limit responses, or a 200 OK that
    # parses to zero rows. That last case is a real, observed failure mode (2026-07-10
    # production run: 3/3 requests for a 90-day recent window came back 200 with no warning
    # banner and no exception, yet zero parseable rows — while the SAME endpoint/parser
    # succeeded seconds later for the long-window anchor requests in the same run, and manual
    # replay of an equivalent range afterwards returned full valid data). Nothing about a
    # multi-day AMFI range is legitimately all-empty, so treat it as transient, not a real result.
    for attempt in range(4):
        req = urllib.request.Request(f"{REPORT}?frmdt={frm:%d-%b-%Y}&todt={to:%d-%b-%Y}", headers={"User-Agent": "mfpulse/1.0"})
        try:
            time.sleep(1.5)  # Be polite to the AMFI endpoint to prevent rate limiting
            with urllib.request.urlopen(req, timeout=120) as r:
                content = r.read().decode("utf-8", errors="replace")
                if "Please Select Date Range" in content:
                    print(f"AMFI warning returned for {frm} to {to} (attempt {attempt+1}/4). Retrying in 4s...", file=sys.stderr)
                    time.sleep(4)
                    continue
                out = {}
                for raw in content.splitlines():
                    p = raw.strip().split(";")
                    if len(p) < 8 or not p[0].strip().isdigit():
                        continue
                    try:
                        nav = float(p[4].strip().replace(",", ""))
                        d = datetime.strptime(p[7].strip(), "%d-%b-%Y").date()
                    except ValueError:
                        continue
                    if nav > 0:
                        out.setdefault(p[0].strip(), {})[d] = nav
                if not out:
                    print(f"AMFI returned 0 parseable rows for {frm} to {to} ({len(content)} bytes, attempt {attempt+1}/4). Retrying in 4s...", file=sys.stderr)
                    time.sleep(4)
                    continue
                return out
        except Exception as e:
            print(f"AMFI fetch error for {frm} to {to}: {e} (attempt {attempt+1}/4). Retrying in 4s...", file=sys.stderr)
            time.sleep(4)
    print(f"::warning::AMFI fetch for {frm} to {to} produced no usable data after 4 attempts — giving up on this window.", file=sys.stderr)
    return {}


def fetch_series_db(start_date, end_date):
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        return {}
    try:
        import psycopg2
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()
        cur.execute(
            "SELECT scheme_code, nav_date, nav_value FROM fact_nav_daily WHERE nav_date >= %s AND nav_date <= %s",
            (start_date, end_date),
        )
        series = {}
        for code, d, nav in cur.fetchall():
            if nav and float(nav) > 0:
                series.setdefault(str(code), {})[d] = float(nav)
        conn.close()
        return series
    except Exception as e:
        print(f"DB NAV fetch error: {e}", file=sys.stderr)
        return {}


def fetch_series(asof, days):
    """Dense daily NAV series per scheme over the last `days`. DB-first, HTTP only for the gap
    (2026-07-29): the original order tried AMFI's HTTP history endpoint for the ENTIRE window
    first, merging in fact_nav_daily's own (fast, reliable) coverage only afterward. That meant a
    GH-Actions-specific problem with the HTTP endpoint blocked every run for 4+ days straight
    (2026-07-25..29) even though the DB already held the data needed -- confirmed live: the same
    endpoint returns real, well-formed data in seconds when called from outside GH Actions'
    runners, and every GH Actions attempt in that window either timed out or came back as a
    fixed-size (13694-byte) unparseable response, the signature of a block/rate-limit response
    page rather than a genuine multi-day AMFI outage (which would vary in size and self-heal
    within hours, not persist for days). Root cause is network-path/IP-range specific, not fixable
    from this script -- but daily ingestion (cloud_pipeline, a separate step that has kept
    succeeding throughout this incident) already deposits fresh rows into fact_nav_daily every
    run, so the DB alone is fully sufficient for any chunk it already covers. Only genuinely
    uncovered chunks (older than this platform's own ingestion history, e.g. real 6mo/1y/3y/5y
    anchors) still need the HTTP path -- and if THAT also fails, the resulting nulls only degrade
    long-window returns, not the r1m/r1w/r1d metrics assert_returns_usable gates on."""
    start = asof - timedelta(days=days)
    series = fetch_series_db(start, asof)
    covered_dates = {d for m in series.values() for d in m.keys()}

    cur = start
    while cur <= asof:
        chunk_to = min(cur + timedelta(days=44), asof)
        # "Any" coverage, not "full" coverage: cloud_pipeline ingests one shared NAVAll.txt
        # snapshot per run covering every scheme at once, so one scheme having a date inside this
        # chunk is a reliable proxy for "ingestion reached this chunk" -- no need for a slower
        # per-scheme/per-day completeness check to get the benefit of skipping a doomed HTTP call.
        if not any(cur <= d <= chunk_to for d in covered_dates):
            part = _fetch_window(cur, chunk_to)
            for code, m in part.items():
                series.setdefault(code, {}).update(m)
        cur = chunk_to + timedelta(days=1)

    return series


def anchor_nav(asof, days):
    window_start, window_end = asof - timedelta(days=days + 7), asof - timedelta(days=days)
    db_series = fetch_series_db(window_start, window_end)
    out = {c: m[max(m)] for c, m in db_series.items() if m}
    if not out:
        # No DB coverage at all in this window -- expected for anchors older than this platform's
        # own ingestion history (see fetch_series' docstring above for the full incident context).
        # HTTP is the only possible source here; if it also fails, this anchor stays null rather
        # than blocking the run, same tradeoff as fetch_series' per-chunk skip.
        w = _fetch_window(window_start, window_end)
        for c, m in w.items():
            if m:
                out[c] = m[max(m)]
    return out


def risk_from_series(navs_by_date):
    """navs_by_date: {date: nav}. Returns risk/trend metrics or None if too sparse."""
    items = sorted(navs_by_date.items())
    if len(items) < 20:
        return None
    navs = [v for _, v in items]
    rets = [(navs[i] - navs[i - 1]) / navs[i - 1] for i in range(1, len(navs)) if navs[i - 1] > 0]
    if len(rets) < 15:
        return None
    downside = [r for r in rets if r < 0]
    vol90 = round(pstdev(rets) * SQRT252 * 100, 2)
    vol30 = round(pstdev(rets[-21:]) * SQRT252 * 100, 2) if len(rets) >= 21 else vol90
    dvol = round(pstdev(downside) * SQRT252 * 100, 2) if len(downside) >= 2 else 0.0
    # max drawdown over window
    peak, maxdd = navs[0], 0.0
    for v in navs:
        peak = max(peak, v)
        maxdd = min(maxdd, (v - peak) / peak)
    hi, lo = max(navs), min(navs)
    return {
        "vol30": vol30, "vol90": vol90, "dvol90": dvol,
        "maxdd90": round(maxdd * 100, 2),
        "negDays": sum(1 for r in rets if r < 0), "obs": len(rets),
        "consistency": round(100 * sum(1 for r in rets if r >= 0) / len(rets)),
        "recentHigh": round(hi, 2), "recentLow": round(lo, 2),
        "ddFromHigh": round((navs[-1] - hi) / hi * 100, 2),
        "mom7": round((navs[-1] - navs[-6]) / navs[-6] * 100, 2) if len(navs) >= 6 else None,
        "mom30": round((navs[-1] - navs[-22]) / navs[-22] * 100, 2) if len(navs) >= 22 else None,
        "mom90": round((navs[-1] - navs[0]) / navs[0] * 100, 2),
    }


def assert_returns_usable(coverage):
    """Fail fast and loudly, right at the source, if the AMFI historical-fetch pipeline came
    back so empty that funds.json would ship with r1m nulled out fleet-wide — the exact failure
    mode tests/test_amfi_retry.py documents (2026-07-10 incident) and test_scores.py's
    zero-tolerance test_health_in_range_on_real_data exists to catch as a last resort.

    The 2026-07-23..07-28 incident: this gate failed on every single production-refresh run for
    5+ days straight, always at ~28-30% — not the noisy, self-heals-within-24h pattern a real
    AMFI outage produces, and not the near-0% signature of the 2026-07-10 incident either. Root
    cause, confirmed 2026-07-28 by instrumenting a live run: the 50% floor was originally checked
    as coverage['with30d'] / coverage['priced'] — every scheme with a current NAV, including
    IDCW-option schemes (~53% of 'priced' that day), which main() unconditionally nulls r1m out
    for a few lines after `funds[code] = rec` (the `if idcw:` block), regardless of whether the
    AMFI fetch succeeded. So with30d could never structurally exceed roughly (priced - idcw) —
    already under 50% before accounting for any real data gap. The AMFI pipeline itself was
    never broken: the same instrumented run measured 3956/3991 = 99.1% coverage once scoped to
    coverage['activeEligible'] (active AND not IDCW — the "investable" cohort
    docs/DATA_COVERAGE_MATRIX.md separately documents at ~99.6%), matching a live fetch verified
    independently the same day. Fixed by gating on activeEligible/activeEligibleWith30d instead
    of priced/with30d — the population r1m can actually be non-null for. The 50% floor stays:
    comfortably below a healthy ~99%, comfortably above a real near-total outage.
    """
    eligible = coverage["activeEligible"]
    r1m_pct = 100 * coverage["activeEligibleWith30d"] / max(1, eligible)
    if r1m_pct < 50:
        print(f"::error::Cause: AMFI's NAV history endpoint (DownloadNAVHistoryReport_Po.aspx) "
              f"returned unusable/empty data for this run — only {coverage['activeEligibleWith30d']}/"
              f"{eligible} active non-IDCW schemes ({r1m_pct:.1f}%) got a 1-month return, far below "
              f"the normal ~99%. This funds.json would fail test_scores.py::test_health_in_range_on_"
              f"real_data and must not be committed or deployed. Location: scripts/build_performance.py "
              f"fetch_series()/_fetch_window(). Fix: usually a transient AMFI outage (see "
              f"tests/test_amfi_retry.py) — production-refresh.yml runs again within 24h and should "
              f"self-heal; only investigate the endpoint directly if this repeats across runs.", file=sys.stderr)
        sys.exit(1)


def market_asof(dim):
    """Latest real trading date — NOT the raw max nav_date. Overnight/liquid funds forward-date
    their NAV past weekends/holidays (a Saturday AMFI file carries Sunday-dated NAVs), so raw
    max picks a date almost no scheme actually has: 1-day movers collapse to 0 up / 0 down and
    the sitewide banner shows a future "latest NAV". Equity schemes only price on actual trading
    days, so their max date is the honest market as-of (found live in the 2026-07-04 Saturday
    production run — see docs/PIPELINE_ARCHITECTURE.md addendum)."""
    eq = [r.nav_date for r in dim.values() if r.nav_date and r.asset_class == "Equity"]
    if eq:
        return max(eq)
    return max((r.nav_date for r in dim.values() if r.nav_date), default=date.today())


def main():
    dim = {r.scheme_code: r for r in parse_file("data/NAVAll.txt")}
    asof = market_asof(dim)
    now_nav = {c: r.nav_value for c, r in dim.items() if r.nav_value}

    print("-- fetching 90-day daily series…", file=sys.stderr)
    series = fetch_series(asof, 95)
    anchors = {key: anchor_nav(asof, days) for key, days in ANCHORS}
    print(f"-- series for {len(series)} schemes, {len(anchors)} long-window anchors", file=sys.stderr)

    funds = {}
    for code, r in dim.items():
        if code not in now_nav:
            continue
        name = r.scheme_name.strip()
        idcw, grow, direct = is_idcw(name), is_growth(name), "direct" in name.lower()
        # clamped at 0: overnight funds dated AHEAD of the equity-anchored asof are current, not stale
        stale_days = max(0, (asof - r.nav_date).days) if r.nav_date else 999
        now = now_nav[code]
        rec = {
            "code": code, "name": name, "amc": r.amc_name.replace(" Mutual Fund", ""),
            "category": clean_category(r.category_raw or ""), "assetClass": r.asset_class,
            "plan": "Direct" if direct else "Regular", "option": "Growth" if grow else ("IDCW" if idcw else "Other"),
            "isDirect": direct, "isGrowth": grow, "isIdcw": idcw, "active": stale_days <= FRESH_MAX_DAYS,
            "nav": round(now, 4), "navDate": r.nav_date.isoformat() if r.nav_date else None, "staleDays": stale_days,
        }
        s = series.get(code, {})
        # short windows from the dense series (more accurate than separate anchors)
        def ret_at(days_back):
            target = asof - timedelta(days=days_back)
            past = [(d, v) for d, v in s.items() if d <= target]
            if not past:
                return None
            v0 = max(past)[1]
            return round((now - v0) / v0 * 100, 2) if v0 > 0 else None
        rec["r1d"] = ret_at(1)
        rec["r1w"] = ret_at(7)
        rec["r1m"] = ret_at(30)
        rec["r3m"] = ret_at(90)
        # Long-window (6M/1Y/3Y/5Y) returns compare `now` against an anchor NAV — but if `now`
        # itself is a stale NAV (fund stopped publishing), the figure isn't really "as of today";
        # it's a shorter, mislabeled window dressed up as "1Y". Only compute when the reference
        # NAV is genuinely current (<=7d), matching the site's own freshness bar everywhere else.
        if stale_days <= FRESH_MAX_DAYS:
            for key, days in ANCHORS:
                a = anchors[key].get(code)
                rec[key] = round((now - a) / a * 100, 2) if a and a > 0 else None
        else:
            for key, _ in ANCHORS:
                rec[key] = None
        risk = risk_from_series(s)
        if risk:
            rec.update(risk)
        bm, std = resolve_benchmark(rec["category"], name, r.asset_class)
        if bm:
            rec["benchmark"], rec["benchmarkStd"] = bm, std
        # Suppress NAV artifacts (stock splits / payouts / discontinued-plan resets): a return
        # outside a sane band per window is a data discontinuity, not real performance.
        BANDS = {"r1d": (-20, 20), "r1w": (-35, 45), "r1m": (-55, 120), "r3m": (-65, 180),
                 "r6m": (-75, 250), "r1y": (-85, 400), "r3y": (-90, 2000), "r5y": (-95, 4000)}
        for k, (lo, hi) in BANDS.items():
            if rec.get(k) is not None and not (lo <= rec[k] <= hi):
                rec[k] = None
        if idcw:
            # IDCW plans pay out distributions → NAV drops on payout, so NAV-only returns and
            # risk metrics are distorted and not defensible. Suppress rather than display them.
            for k in ("r1d", "r1w", "r1m", "r3m", "r6m", "r1y", "r3y", "r5y"):
                rec[k] = None
            for k in ("vol30", "vol90", "dvol90", "maxdd90", "negDays", "consistency",
                      "mom7", "mom30", "mom90", "recentHigh", "recentLow", "ddFromHigh", "obs"):
                rec.pop(k, None)
        funds[code] = rec

    # category rank/percentile in (category, plan) equity-growth cohorts
    cohort_members = {}
    for f in funds.values():
        if f["isGrowth"] and not f["isIdcw"] and f["r1m"] is not None and f["assetClass"] == "Equity":
            cohort_members.setdefault(f"{f['category']}|{'D' if f['isDirect'] else 'R'}", []).append(f)
    cohorts = {}
    for key, members in cohort_members.items():
        ranked = sorted(members, key=lambda x: x["r1m"], reverse=True)
        n = len(ranked)
        for i, f in enumerate(ranked):
            f["catRank"], f["catSize"] = i + 1, n
            f["catPct"] = round(100 * (1 - i / n)) if n > 1 else 100
            f["cohortKey"] = key
        rets = [x["r1m"] for x in ranked]
        win_avg = {}
        for w in ("r1w", "r1m", "r3m", "r6m", "r1y", "r3y", "r5y"):
            vs = [x[w] for x in ranked if x.get(w) is not None]
            if vs:
                win_avg[w] = round(mean(vs), 2)
        cohorts[key] = {"avg": round(mean(rets), 2), "median": round(median(rets), 2), "count": n,
                        "winAvg": win_avg,
                        "best": {"code": ranked[0]["code"], "name": ranked[0]["name"], "ret": ranked[0]["r1m"]},
                        "worst": {"code": ranked[-1]["code"], "name": ranked[-1]["name"], "ret": ranked[-1]["r1m"]}}

    for f in funds.values():
        r1m, r3m = f["r1m"], f["r3m"]
        if r1m is not None and r3m is not None:
            f["trend"] = max(0, min(100, round(50 + (r1m - r3m / 3) * 4)))
        elif r1m is not None:
            f["trend"] = max(0, min(100, round(50 + r1m * 3)))
        else:
            f["trend"] = None
        has_latest = f["staleDays"] == 0
        status = "ok" if (has_latest and f["r3m"] is not None) else ("stale" if not has_latest else "limited")
        f["quality"] = {"status": status, "hasLatest": has_latest, "has90d": f["r3m"] is not None,
                        "has1y": f["r1y"] is not None, "staleDays": f["staleDays"],
                        "hasCategory": f["category"] != "Other", "hasAmc": bool(f["amc"]), "obs": f.get("obs", 0)}

    vals = list(funds.values())
    coverage = {
        "total": len(dim), "priced": len(vals), "active": sum(1 for f in vals if f["active"]),
        "with30d": sum(1 for f in vals if f["r1m"] is not None), "with90d": sum(1 for f in vals if f["r3m"] is not None),
        "with180d": sum(1 for f in vals if f["r6m"] is not None), "with1y": sum(1 for f in vals if f["r1y"] is not None),
        "with3y": sum(1 for f in vals if f["r3y"] is not None), "with5y": sum(1 for f in vals if f["r5y"] is not None),
        "withRisk": sum(1 for f in vals if f.get("vol90") is not None),
        "missingLatest": sum(1 for f in vals if f["staleDays"] != 0), "stale7d": sum(1 for f in vals if f["staleDays"] > 7),
        "equity": sum(1 for f in vals if f["assetClass"] == "Equity"),
        "directGrowth": sum(1 for f in vals if f["isDirect"] and f["isGrowth"]),
        "regularGrowth": sum(1 for f in vals if not f["isDirect"] and f["isGrowth"]),
        "growth": sum(1 for f in vals if f["isGrowth"]), "idcw": sum(1 for f in vals if f["isIdcw"]),
        "direct": sum(1 for f in vals if f["isDirect"]), "noCategory": sum(1 for f in vals if f["category"] == "Other"),
        "coveragePct": round(100 * sum(1 for f in vals if f["r3m"] is not None) / max(1, len(vals))),
        # The "investable" cohort per docs/DATA_COVERAGE_MATRIX.md: active (fresh within
        # FRESH_MAX_DAYS) and not IDCW (IDCW returns are unconditionally nulled a few lines up,
        # regardless of fetch success — see the `if idcw:` block above). assert_returns_usable
        # gates on this pair, not on the full 'priced' universe, which includes thousands of
        # matured/legacy/IDCW schemes that were never going to get a fresh r1m either way.
        "activeEligible": sum(1 for f in vals if f["active"] and not f["isIdcw"]),
        "activeEligibleWith30d": sum(1 for f in vals if f["active"] and not f["isIdcw"] and f["r1m"] is not None),
    }
    assert_returns_usable(coverage)

    # Keep EVERY priced scheme so every searchable scheme is also routable/openable.
    # (Previously trimmed to r1m-or-active, which made ~5.6k schemes 404 on click.)
    # Dormant/stale schemes carry null returns — honest, never fabricated. The unpriced
    # tail (no NAV at all) is added by scripts/reconcile_coverage.py, run right after this.
    keep = funds
    with open(f"{DATA}/funds.json", "w") as fh:
        json.dump({"asOf": asof.isoformat(), "source": "AMFI NAV + 90d NAV history",
                   "coverage": coverage, "cohorts": cohorts, "funds": keep}, fh, separators=(",", ":"))

    # performance.json (equity-growth summaries)
    eq = sorted([f for f in vals if f["assetClass"] == "Equity" and f["isGrowth"] and not f["isIdcw"] and f["r1m"] is not None],
                key=lambda f: f["r1m"], reverse=True)
    cats = {}
    for f in eq:
        cats.setdefault(f["category"], []).append(f)
    categories = []
    for cat, fs in cats.items():
        rets = [f["r1m"] for f in fs]
        ranked = sorted(fs, key=lambda f: f["r1m"], reverse=True)
        categories.append({"category": cat, "count": len(fs), "avg": round(mean(rets), 2), "median": round(median(rets), 2),
                           "best": {"name": ranked[0]["name"], "amc": ranked[0]["amc"], "ret": ranked[0]["r1m"], "code": ranked[0]["code"]},
                           "worst": {"name": ranked[-1]["name"], "amc": ranked[-1]["amc"], "ret": ranked[-1]["r1m"], "code": ranked[-1]["code"]},
                           "breadth": round(100 * sum(1 for x in rets if x > 0) / len(rets))})
    categories.sort(key=lambda c: c["avg"], reverse=True)

    cat_median = {c: median([f["r1m"] for f in fs]) for c, fs in cats.items()}
    amc_map = {}
    for f in eq:
        amc_map.setdefault(f["amc"], []).append(f)
    amcs = []
    for amc, fs in amc_map.items():
        if len(fs) < 3:
            continue
        rets = [f["r1m"] for f in fs]
        pct_out = 100 * sum(1 for f in fs if f["r1m"] > cat_median.get(f["category"], 0)) / len(fs)
        breadth = 100 * sum(1 for x in rets if x > 0) / len(fs)
        score = round(0.55 * pct_out + 0.25 * breadth + 0.20 * max(0, min(100, 50 + mean(rets) * 8)), 1)
        amcs.append({"amc": amc, "funds": len(fs), "avg": round(mean(rets), 2), "pct_outperform": round(pct_out), "breadth": round(breadth), "score": score})
    amcs.sort(key=lambda a: a["score"], reverse=True)

    insights = []
    if len(categories) >= 2:
        lead, lag = categories[0], categories[-1]
        insights.append(f"{lead['category']} led equity categories at +{lead['avg']:.1f}% (1-month NAV), outpacing {lag['category']} ({lag['avg']:+.1f}%) by {lead['avg'] - lag['avg']:.1f} pts.")
    if eq[:10]:
        insights.append(f"The top 10 equity funds averaged +{mean([f['r1m'] for f in eq[:10]]):.1f}% over 1 month, led by {eq[0]['name'][:40]} (+{eq[0]['r1m']:.1f}%).")
    allret = [f["r1m"] for f in eq]
    if allret:
        insights.append(f"Across {len(allret):,} equity Growth funds, {100 * sum(1 for x in allret if x > 0) / len(allret):.0f}% posted positive 1-month NAV returns.")
    if amcs:
        insights.append(f"{amcs[0]['amc']} ranks #1 on AMC quality ({amcs[0]['pct_outperform']:.0f}% of its funds beat their category median).")

    def slim(f):
        return {"code": f["code"], "name": f["name"], "amc": f["amc"], "category": f["category"], "nav": f["nav"],
                "r1w": f["r1w"], "r1m": f["r1m"], "r3m": f["r3m"], "r6m": f["r6m"], "r1y": f["r1y"]}

    with open(f"{DATA}/performance.json", "w") as fh:
        json.dump({"asOf": asof.isoformat(), "universe": len(eq),
                   "source": "AMFI NAV history · equity Direct/Growth plans · point-to-point NAV returns",
                   "windows": ["r1w", "r1m", "r3m", "r6m", "r1y"],
                   "top": [slim(f) for f in eq[:30]], "bottom": [slim(f) for f in eq[-15:][::-1]],
                   "categories": categories, "amcs": amcs, "insights": insights}, fh, indent=0)

    print(f"-- funds.json: {len(keep)} kept | risk on {coverage['withRisk']} | 1y {coverage['with1y']} | "
          f"3y {coverage['with3y']} | direct-growth {coverage['directGrowth']}", file=sys.stderr)

    # Make every searchable scheme routable: add the unpriced tail + record the openable invariant.
    try:
        from scripts.reconcile_coverage import main as reconcile
        reconcile()
    except Exception as e:  # reconcile is additive; never let it break the perf build
        print(f"-- reconcile_coverage skipped: {e}", file=sys.stderr)


if __name__ == "__main__":
    main()
