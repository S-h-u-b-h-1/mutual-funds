"""
Compute a per-AMC normalised EQUITY NAV INDEX trend from real AMFI history and
emit a compact SQL upsert (one JSONB row per AMC) for the `amc_trend` table.

Why an index: an AMC's equity schemes have wildly different NAV magnitudes, so we
normalise each scheme to 100 at the window start and average across the AMC's
equity schemes per day. The result is a meaningful "how did this AMC's equity
book move" sparkline that stores in ~45 tiny rows (cheap to load via execute_sql,
no public-insert policy needed).

    .venv/bin/python -m scripts.build_amc_trend 20-May-2026 19-Jun-2026 > /tmp/amc_trend.sql
"""

from __future__ import annotations

import sys
import urllib.request
from collections import defaultdict
from datetime import datetime

from ingestion.amfi_parser import parse_file

REPORT = "https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx"


def download(frmdt: str, todt: str) -> list[str]:
    req = urllib.request.Request(
        f"{REPORT}?frmdt={frmdt}&todt={todt}", headers={"User-Agent": "mfpulse/0.1"}
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        return resp.read().decode("utf-8", errors="replace").splitlines()


def sql_escape(s: str) -> str:
    return s.replace("'", "''")


def main(frmdt: str, todt: str) -> None:
    # scheme_code -> amc_name, for EQUITY schemes only
    eq = {r.scheme_code: r.amc_name for r in parse_file("data/NAVAll.txt") if r.asset_class == "Equity"}

    # scheme_code -> {date: nav}
    series: dict[str, dict[str, float]] = defaultdict(dict)
    for raw in download(frmdt, todt):
        s = raw.strip()
        if ";" not in s:
            continue
        p = s.split(";")
        if len(p) < 8 or not p[0].strip().isdigit():
            continue
        code = p[0].strip()
        if code not in eq:
            continue
        try:
            nav = float(p[4].strip().replace(",", ""))
            d = datetime.strptime(p[7].strip(), "%d-%b-%Y").date()
        except ValueError:
            continue
        series[code][d.isoformat()] = nav

    # Per AMC: average each scheme's NAV-indexed-to-100 across all its equity schemes, per date.
    amc_dates: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    for code, by_date in series.items():
        if len(by_date) < 2:
            continue
        first = by_date[min(by_date)]
        if not first:
            continue
        for d, nav in by_date.items():
            amc_dates[eq[code]][d].append(nav / first * 100.0)

    import json

    out: dict[str, list] = {}
    for amc, by_date in amc_dates.items():
        points = [[d, round(sum(v) / len(v), 2)] for d, v in sorted(by_date.items())]
        if len(points) >= 3:
            out[amc] = points

    # Static historical snapshot: bundled into the frontend (real AMFI data, no DB
    # write needed). The nightly pipeline can regenerate this file.
    print(json.dumps({"window": [frmdt, todt], "amcs": out}, indent=0))
    print(f"-- {len(out)} AMCs", file=sys.stderr)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
