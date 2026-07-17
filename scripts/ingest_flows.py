"""
AMFI Monthly Report (MCR) ingestion -> fact_flow_monthly + flow_signals (Supabase).

Real, industry-wide net flow per fund category, published monthly by AMFI as a predictably-URLed
.xls export (verified 2026-07-17: https://www.amfiindia.com/research-information/amfi-monthly).
Mirrors cloud_pipeline.py/ingest_news.py's proven pattern: idempotent (ON CONFLICT upsert on
fact_flow_monthly's (amc_name, asset_class, month) key), Supabase service-role write.

Checks the last few months on every run (not just "this month") so a missed/failed run
self-heals on the next one, and so a not-yet-published month (AMFI typically publishes a
month's report a few days into the following month — confirmed 2026-07-17: requesting an
unpublished month returns a genuine HTTP 404, not a truncated/garbage 200) doesn't fail the
run, just skips that month with a warning.

flow_signals has no natural key (surrogate id only, unlike fact_flow_monthly's composite PK),
so it's fully recomputed from the complete real series each run: delete-then-reinsert, scoped
to the industry sentinel AMC only so this never touches a differently-sourced signal row.

    SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... python -m scripts.ingest_flows
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

from ingestion.sebi_flows import AMFI_MCR_SOURCE, load_amfi_mcr_excel
from ingestion.spike_detect import detect

URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
UA = "Mozilla/5.0 (compatible; MFPulseFlowBot/1.0; +https://mf-pulse.vercel.app)"

MONTH_ABBR = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
INDUSTRY_AMC = "Industry (All AMCs)"

# Trailing months re-checked on every run. AMFI's MCR for month M is typically published within
# the first ~2 weeks of month M+1, so 3 covers a missed run without re-downloading the archive.
LOOKBACK_MONTHS = 3


def _headers(prefer="resolution=merge-duplicates,return=minimal"):
    return {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json", "Prefer": prefer}


def _post(table, rows, on_conflict=None, prefer="resolution=merge-duplicates,return=minimal"):
    if not rows:
        return []
    ep = f"{URL}/rest/v1/{table}" + (f"?on_conflict={on_conflict}" if on_conflict else "")
    req = urllib.request.Request(ep, data=json.dumps(rows).encode(), method="POST", headers=_headers(prefer))
    with urllib.request.urlopen(req, timeout=60) as r:
        body = r.read()
        return json.loads(body) if body else []


def _get(path):
    req = urllib.request.Request(f"{URL}/rest/v1/{path}", headers=_headers())
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def _delete(path):
    req = urllib.request.Request(f"{URL}/rest/v1/{path}", method="DELETE", headers=_headers())
    with urllib.request.urlopen(req, timeout=30) as r:
        r.read()


def _recent_months(n):
    today = datetime.now(timezone.utc)
    months = []
    y, m = today.year, today.month
    for _ in range(n):
        months.append((y, m))
        m -= 1
        if m == 0:
            m, y = 12, y - 1
    return list(reversed(months))


def download_mcr(year, month_num):
    abbr = MONTH_ABBR[month_num - 1]
    url = f"https://portal.amfiindia.com/spages/am{abbr}{year}repo.xls"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            data = r.read()
    except (urllib.error.HTTPError, urllib.error.URLError) as e:
        print(f"  {abbr}{year}: not available yet ({e}) — will retry next run", file=sys.stderr)
        return None
    if len(data) < 1000:
        print(f"  {abbr}{year}: response too small ({len(data)} bytes) — not a real report yet", file=sys.stderr)
        return None
    fd, path = tempfile.mkstemp(suffix=".xls")
    with os.fdopen(fd, "wb") as f:
        f.write(data)
    return path


def run():
    if not URL or not KEY:
        print("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — skipping.", file=sys.stderr)
        return 0

    loaded_months = []
    for year, month_num in _recent_months(LOOKBACK_MONTHS):
        path = download_mcr(year, month_num)
        if path is None:
            continue
        try:
            month_iso = f"{year:04d}-{month_num:02d}-01"
            rows = load_amfi_mcr_excel(path, month_iso)
            if not rows:
                print(f"  {month_iso}: parsed 0 rows — skipping", file=sys.stderr)
                continue
            _post("fact_flow_monthly", rows, on_conflict="amc_name,asset_class,month")
            loaded_months.append(month_iso)
            print(f"  {month_iso}: upserted {len(rows)} category rows", file=sys.stderr)
        finally:
            os.unlink(path)

    if not loaded_months:
        print("No new/updated months this run.", file=sys.stderr)
        return 0

    all_real_rows = _get(
        "fact_flow_monthly?source=eq." + urllib.parse.quote(AMFI_MCR_SOURCE) +
        "&select=amc_name,asset_class,month,net_flow_cr&order=month.asc"
    )
    signals = detect(all_real_rows)
    _delete("flow_signals?amc_name=eq." + urllib.parse.quote(INDUSTRY_AMC))
    if signals:
        _post(
            "flow_signals",
            [
                {
                    "amc_name": s.amc_name,
                    "asset_class": s.asset_class,
                    "month": s.month,
                    "net_flow_cr": s.net_flow_cr,
                    "z_score": s.z_score,
                    "signal": s.signal,
                }
                for s in signals
            ],
        )
    print(f"Loaded {len(loaded_months)} month(s), recomputed {len(signals)} signal(s) from {len(all_real_rows)} real rows.")
    return len(loaded_months)


if __name__ == "__main__":
    run()
