"""
Monthly factsheet pipeline (Phase 8) — one entry point, no manual intervention:

    Acquire → Validate → Parse → Normalize → Ingest → Coverage report

Acquisition + parsing + normalization + ingest are handled by ingest_factsheets (which
fetches official AMC PDFs, validates %PDF, parses, validates fields, and writes
metadata.json with lineage). validate_metadata produces the QC report. This wrapper chains
them and prints a coverage summary so the GitHub Actions cron can run end-to-end.

    .venv/bin/python -m scripts.factsheet_pipeline
"""

from __future__ import annotations

import json
import sys

from scripts import ingest_factsheets, validate_metadata


def coverage_summary():
    d = json.load(open("frontend/app/data/metadata.json"))
    md = d.get("metadata", [])
    n = max(1, len(md))
    fields = ["benchmark", "fund_manager", "aum_crores", "riskometer", "launch_date"]
    cov = {f: sum(1 for r in md if r.get(f)) for f in fields}
    cov["holdings"] = sum(1 for r in md if r.get("holdings"))
    cov["sectors"] = sum(1 for r in md if r.get("sector_allocation"))
    print(f"== Coverage ({len(md)} scheme codes) ==", file=sys.stderr)
    for k, v in cov.items():
        print(f"   {k:14} {v}/{len(md)} ({100 * v / n:.0f}%)", file=sys.stderr)
    return cov


def main():
    print(">> [1/3] Acquire + parse + ingest", file=sys.stderr)
    ingest_factsheets.main()
    print(">> [2/3] Validate (QC report)", file=sys.stderr)
    validate_metadata.main()
    print(">> [3/3] Coverage report", file=sys.stderr)
    coverage_summary()
    print(">> pipeline complete", file=sys.stderr)


if __name__ == "__main__":
    main()
