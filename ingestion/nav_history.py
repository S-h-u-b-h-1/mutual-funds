"""
Backfill historical NAV into fact_nav_daily from AMFI's NAV-history report.

AMFI exposes a date-range report (verified working) at:
    https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx?frmdt=DD-Mon-YYYY&todt=DD-Mon-YYYY

It is semicolon-separated with a DIFFERENT column layout than NAVAll.txt:
    Scheme Code;Scheme Name;ISIN ...;ISIN ...;Net Asset Value;Repurchase;Sale;Date

We only need (scheme_code, nav_date, nav_value). Rows are filtered to scheme_codes
that already exist in dim_scheme (avoids FK violations for retired schemes), then
upserted into Supabase via PostgREST.

    SUPABASE_URL=... SUPABASE_ANON_KEY=... \
      .venv/bin/python -m ingestion.nav_history 20-May-2026 19-Jun-2026
"""

from __future__ import annotations

import json
import os
import sys
import urllib.request
from datetime import datetime

from .amfi_parser import parse_file

URL = os.environ["SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_ANON_KEY"]
BATCH = 2000
REPORT = "https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx"


def download(frmdt: str, todt: str) -> list[str]:
    url = f"{REPORT}?frmdt={frmdt}&todt={todt}"
    req = urllib.request.Request(url, headers={"User-Agent": "mfpulse/0.1"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        return resp.read().decode("utf-8", errors="replace").splitlines()


def parse_history(lines, valid_codes: set[str]):
    """Yield (scheme_code, nav_date_iso, nav_value) for valid schemes."""
    for raw in lines:
        s = raw.strip()
        if ";" not in s:
            continue
        p = s.split(";")
        if len(p) < 8 or not p[0].strip().isdigit():
            continue
        code = p[0].strip()
        if code not in valid_codes:
            continue
        nav_raw = p[4].strip()
        try:
            nav = float(nav_raw.replace(",", ""))
        except ValueError:
            continue
        try:
            d = datetime.strptime(p[7].strip(), "%d-%b-%Y").date().isoformat()
        except ValueError:
            continue
        yield {"scheme_code": code, "nav_date": d, "nav_value": nav}


def upsert(rows: list[dict]) -> None:
    endpoint = f"{URL}/rest/v1/fact_nav_daily?on_conflict=scheme_code,nav_date"
    for i in range(0, len(rows), BATCH):
        chunk = rows[i : i + BATCH]
        req = urllib.request.Request(
            endpoint,
            data=json.dumps(chunk).encode(),
            method="POST",
            headers={
                "apikey": KEY,
                "Authorization": f"Bearer {KEY}",
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates,return=minimal",
            },
        )
        with urllib.request.urlopen(req, timeout=120) as resp:
            assert resp.status in (200, 201, 204), resp.status
        print(f"  fact_nav_daily: {min(i + BATCH, len(rows))}/{len(rows)}")


def main(frmdt: str, todt: str) -> None:
    valid = {r.scheme_code for r in parse_file("data/NAVAll.txt")}
    print(f"{len(valid)} valid scheme_codes; downloading {frmdt}..{todt}")
    rows = list(parse_history(download(frmdt, todt), valid))
    print(f"Parsed {len(rows)} historical NAV rows; upserting…")
    upsert(rows)
    print("Done.")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit("usage: python -m ingestion.nav_history <frmdt DD-Mon-YYYY> <todt DD-Mon-YYYY>")
    main(sys.argv[1], sys.argv[2])
