"""
Quality-control validation for ingested factsheet metadata (Phase 7).

Detects: stale factsheets, missing holdings/sectors, impossible AUM, impossible expense
ratios, and over-attributed managers (same manager across too many funds — the mis-attribution
guard). Writes docs/FACTSHEET_VALIDATION.md and prints a summary.

    .venv/bin/python -m scripts.validate_metadata
"""

from __future__ import annotations

import json
from collections import Counter
from datetime import date

REF = date(2026, 6, 23)            # platform asOf
STALE_DAYS = 120                   # factsheet older than ~4 months is flagged


def main():
    d = json.load(open("frontend/app/data/metadata.json"))
    md = d.get("metadata", [])
    n = len(md)
    issues = {"stale": [], "no_holdings": [], "no_sectors": [], "bad_aum": [], "bad_expense": [], "over_manager": []}

    for r in md:
        sd = r.get("source_date")
        if sd:
            try:
                age = (REF - date.fromisoformat(sd)).days
                if age > STALE_DAYS:
                    issues["stale"].append((r["scheme_code"], sd, age))
            except ValueError:
                pass
        if not r.get("holdings"):
            issues["no_holdings"].append(r["scheme_code"])
        if not r.get("sector_allocation"):
            issues["no_sectors"].append(r["scheme_code"])
        aum = r.get("aum_crores")
        if aum is not None and (aum < 0 or aum > 5_000_000):
            issues["bad_aum"].append((r["scheme_code"], aum))
        er = r.get("expense_ratio")
        if er is not None and not (0 <= er <= 4):
            issues["bad_expense"].append((r["scheme_code"], er))

    mgr_counts = Counter()
    for r in md:
        if r.get("fund_manager"):
            mgr_counts[r["fund_manager"]] += 1
    # a single manager string on > 30% of funds is suspicious (foreign co-manager pattern)
    for mgr, c in mgr_counts.items():
        if c > max(8, 0.3 * n):
            issues["over_manager"].append((mgr, c))

    lines = ["# MF Pulse — Factsheet Validation Report (Phase 7)", "",
             f"_Generated from {n} ingested scheme rows. Reference date {REF}._", "",
             "| Check | Flagged |", "|---|---|",
             f"| Stale factsheet (>{STALE_DAYS}d) | {len(issues['stale'])} |",
             f"| Missing holdings | {len(issues['no_holdings'])} |",
             f"| Missing sectors | {len(issues['no_sectors'])} |",
             f"| Impossible AUM | {len(issues['bad_aum'])} |",
             f"| Impossible expense ratio | {len(issues['bad_expense'])} |",
             f"| Over-attributed manager | {len(issues['over_manager'])} |", ""]
    if issues["over_manager"]:
        lines.append("**Over-attributed managers (rejected upstream, should be 0):** " +
                     ", ".join(f"{m} ×{c}" for m, c in issues["over_manager"]))
    lines.append("")
    lines.append("All flagged values are surfaced (stale badges / 'not available'), never silently shown as current. "
                 "Impossible values are rejected at ingest by `normalize.validate` before they reach the product.")
    open("docs/FACTSHEET_VALIDATION.md", "w").write("\n".join(lines))

    print(f"validated {n} rows | stale {len(issues['stale'])} | no_holdings {len(issues['no_holdings'])} | "
          f"no_sectors {len(issues['no_sectors'])} | bad_aum {len(issues['bad_aum'])} | "
          f"bad_expense {len(issues['bad_expense'])} | over_manager {len(issues['over_manager'])}")


if __name__ == "__main__":
    main()
