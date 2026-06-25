"""
Real factsheet ingestion — downloads legitimate AMC factsheet PDFs, parses them with the
implemented adapters, matches scheme codes against the AMFI universe, validates, and writes
real metadata (with lineage: source_url + source_date) to frontend/app/data/metadata.json.

Only confidently-extracted values are stored; missing fields stay null; stale factsheets are
flagged by source_date. Nothing is fabricated.

    .venv/bin/python -m scripts.ingest_factsheets
"""

from __future__ import annotations

import dataclasses
import io
import json
import sys
import urllib.request

import pypdf

from ingestion.amfi_parser import parse_file
from ingestion.factsheet.adapters.sbi import SBIAdapter
from ingestion.factsheet.normalize import validate, completeness

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36"
BASE = "https://www.sbimf.com/docs/default-source/scheme-factsheets/"

# Curated, legitimate, directly-fetchable SBI per-scheme factsheets (AMC official source).
# Simple pattern sbi-<slug>-factsheet-.pdf resolves for the SBI equity range.
SBI_FUNDS = {
    "small-cap-fund": "SBI Small Cap Fund",
    "large-midcap-fund": "SBI Large & Midcap Fund",
    "focused-equity-fund": "SBI Focused Equity Fund",
    "flexicap-fund": "SBI Flexicap Fund",
    "technology-opportunities-fund": "SBI Technology Opportunities Fund",
    "healthcare-opportunities-fund": "SBI Healthcare Opportunities Fund",
    "consumption-opportunities-fund": "SBI Consumption Opportunities Fund",
    "banking-financial-services-fund": "SBI Banking & Financial Services Fund",
    "infrastructure-fund": "SBI Infrastructure Fund",
    "magnum-global-fund": "SBI Magnum Global Fund",
    "magnum-comma-fund": "SBI Magnum COMMA Fund",
    "long-term-equity-fund": "SBI Long Term Equity Fund",
    "dividend-yield-fund": "SBI Dividend Yield Fund",
    "multicap-fund": "SBI Multicap Fund",
    "magnum-midcap-fund": "SBI Magnum Midcap Fund",
    "psu-fund": "SBI PSU Fund",
    "blue-chip-fund": "SBI Bluechip Fund",
    "magnum-equity-esg-fund": "SBI Magnum Equity ESG Fund",
    "nifty-index-fund": "SBI Nifty Index Fund",
}
CURATED = [("SBI", SBIAdapter, name, BASE + f"sbi-{slug}-factsheet-.pdf") for slug, name in SBI_FUNDS.items()]
CURATED.append(("SBI", SBIAdapter, "SBI Contra Fund", BASE + "sbi-contra-fund-factsheet-17fae076-7a0e-4e87-b82c-ab217d24ee3a.pdf?sfvrsn=d591624_2"))


def norm(s: str) -> str:
    return s.lower().replace("&", "and").replace("  ", " ").strip()


def collapse(s: str) -> str:
    """Space/hyphen-insensitive key so 'Blue Chip' matches AMFI 'Bluechip', '&'→'and'."""
    return norm(s).replace(" ", "").replace("-", "")


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=90) as r:
        data = r.read()
    if not data.startswith(b"%PDF"):
        raise RuntimeError("not a PDF")
    return data


def pdf_text(b: bytes) -> str:
    reader = pypdf.PdfReader(io.BytesIO(b))
    return "\n".join((p.extract_text() or "") for p in reader.pages)


def main():
    dim = list(parse_file("data/NAVAll.txt"))   # materialize — it's a generator, reused per fund
    rows, audit = [], []
    seen = set()

    for amc, AdapterCls, fund_base, url in CURATED:
        rec = {"amc": amc, "fund": fund_base, "url": url, "status": "ok", "codes": 0}
        try:
            text = pdf_text(fetch(url))
            m = AdapterCls().parse_scheme_block(text)
        except Exception as e:  # noqa: BLE001
            rec.update(status="failed", error=str(e)[:80])
            audit.append(rec)
            continue
        m.source = f"{amc} factsheet PDF"
        m.source_url = url

        base = collapse(fund_base)
        matches = [r for r in dim if collapse(r.scheme_name).startswith(base)]
        for r in matches:
            if r.scheme_code in seen:
                continue
            seen.add(r.scheme_code)
            mm = dataclasses.replace(m, scheme_code=r.scheme_code, scheme_name=r.scheme_name)
            problems = validate(mm)
            if problems:
                continue
            row = dataclasses.asdict(mm)
            row["completeness"] = completeness(mm)
            rows.append(row)
        rec["codes"] = sum(1 for x in rows if collapse(x["scheme_name"]).startswith(base))
        rec["source_date"] = m.source_date
        audit.append(rec)

    by_amc = {}
    for r in rows:
        by_amc.setdefault(r["amc"], 0)
        by_amc[r["amc"]] += 1

    out = {
        "asOf": "2026-06-23", "source": "AMC factsheet PDFs (official)",
        "adapters": 4, "parser_ready": 4,
        "schemes_populated": len(rows), "by_amc": by_amc, "audit": audit, "metadata": rows,
    }
    with open("frontend/app/data/metadata.json", "w") as fh:
        json.dump(out, fh, separators=(",", ":"))
    print(f"-- ingested {len(rows)} scheme rows from {sum(1 for a in audit if a['status']=='ok')} factsheets", file=sys.stderr)
    for a in audit:
        print(f"   {a['fund']:28} {a['status']:7} codes={a.get('codes',0)} src={a.get('source_date','-')}", file=sys.stderr)


if __name__ == "__main__":
    main()
