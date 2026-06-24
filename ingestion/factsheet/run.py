"""Factsheet ingestion orchestrator.

Iterates registered AMC adapters, runs the implemented ones, validates + normalizes their
output, and writes (a) a metadata bundle the frontend can read and (b) an audit row per AMC
(status, schemes found, rows populated, problems) for fact_factsheet_runs. Unimplemented
adapters are recorded as 'pending' — never skipped silently, never fabricated.

    .venv/bin/python -m ingestion.factsheet.run
"""

from __future__ import annotations

import json
import sys

from .registry import ADAPTERS
from .normalize import completeness


def run_all(as_of=None) -> dict:
    audit = []
    rows = []
    for name, cls in ADAPTERS.items():
        adapter = cls()
        if not getattr(cls, "implemented", False):
            audit.append({"amc": name, "status": "pending", "reason": "PDF parser not yet implemented",
                          "url": adapter.factsheet_url(as_of)})
            continue
        rec = adapter.run(as_of)
        for m in rec.pop("rows", []):
            rows.append({**m.to_metadata_row(), "completeness": completeness(m)})
        audit.append(rec)

    bundle = {"asOf": as_of, "adapters": len(ADAPTERS),
              "parser_ready": sum(1 for c in ADAPTERS.values() if getattr(c, "implemented", False)),
              "succeeded": sum(1 for a in audit if a.get("status") == "ok"),
              "failed": sum(1 for a in audit if a.get("status") == "failed"),
              "pending": sum(1 for a in audit if a.get("status") == "pending"),
              "schemes_populated": len(rows), "audit": audit, "metadata": rows}
    return bundle


def main():
    bundle = run_all()
    out = "frontend/app/data/metadata.json"
    with open(out, "w") as fh:
        json.dump({k: bundle[k] for k in ("asOf", "adapters", "parser_ready", "succeeded", "failed", "pending", "schemes_populated", "metadata")}, fh, separators=(",", ":"))
    print(f"-- adapters {bundle['adapters']} | parser_ready {bundle['parser_ready']} | "
          f"succeeded {bundle['succeeded']} | failed {bundle['failed']} | schemes populated {bundle['schemes_populated']}", file=sys.stderr)
    for a in bundle["audit"]:
        extra = f" ({a.get('error', '')[:60]})" if a.get("status") == "failed" else ""
        print(f"   {a['amc']:32} {a['status']}{extra}", file=sys.stderr)


if __name__ == "__main__":
    main()
