"""Capture the public AMFI search universe independently of the generated fund bundle.

Run intentionally after a NAVAll refresh. This snapshot contains only public scheme codes
and source provenance; CI never needs a developer's ignored raw download to run coverage.
"""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from ingestion.amfi_parser import parse_file

ROOT = Path(__file__).resolve().parents[1]


def main():
    source = ROOT / "data/NAVAll.txt"
    codes = sorted({row.scheme_code for row in parse_file(str(source))})
    if not codes:
        raise ValueError("AMFI source universe is empty")
    snapshot = {
        "sourceUrl": "https://portal.amfiindia.com/spages/NAVAll.txt",
        "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "snapshotPreparedAt": datetime.now(timezone.utc).isoformat(),
        "note": "Prepared from the separately downloaded official raw file, not generated funds.json; this timestamp is not a source publication timestamp.",
        "schemeCount": len(codes),
        "schemeCodes": codes,
    }
    target = ROOT / "tests/fixtures/financial/amfi_search_universe.json"
    target.write_text(json.dumps(snapshot, indent=2) + "\n")
    print(f"Public AMFI search fixture: {len(codes)} scheme codes; source checksum recorded")


if __name__ == "__main__":
    main()
