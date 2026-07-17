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
import hashlib
import io
import json
import os
import sys
import urllib.request

import pypdf

from ingestion.amfi_parser import parse_file
from ingestion.factsheet.adapters.sbi import SBIAdapter
from ingestion.factsheet.normalize import validate, completeness, collapse
from ingestion.factsheet.provenance import record_provenance
from scripts.archive_factsheets import archive_snapshot

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
    # hybrid
    "equity-hybrid-fund": "SBI Equity Hybrid Fund",
    "balanced-advantage-fund": "SBI Balanced Advantage Fund",
    "conservative-hybrid-fund": "SBI Conservative Hybrid Fund",
    "multi-asset-allocation-fund": "SBI Multi Asset Allocation Fund",
    "arbitrage-opportunities-fund": "SBI Arbitrage Opportunities Fund",
    "equity-savings-fund": "SBI Equity Savings Fund",
    # debt
    "liquid-fund": "SBI Liquid Fund",
    "overnight-fund": "SBI Overnight Fund",
    "magnum-ultra-short-duration-fund": "SBI Magnum Ultra Short Duration Fund",
    "magnum-low-duration-fund": "SBI Magnum Low Duration Fund",
    "savings-fund": "SBI Savings Fund",
    "magnum-medium-duration-fund": "SBI Magnum Medium Duration Fund",
    "short-term-debt-fund": "SBI Short Term Debt Fund",
    "corporate-bond-fund": "SBI Corporate Bond Fund",
    "credit-risk-fund": "SBI Credit Risk Fund",
    "banking-and-psu-fund": "SBI Banking and PSU Fund",
    "magnum-gilt-fund": "SBI Magnum Gilt Fund",
    "dynamic-bond-fund": "SBI Dynamic Bond Fund",
    "magnum-constant-maturity-fund": "SBI Magnum Constant Maturity Fund",
    "long-duration-fund": "SBI Long Duration Fund",
    "floating-rate-debt-fund": "SBI Floating Rate Debt Fund",
}
CURATED = [("SBI", SBIAdapter, name, BASE + f"sbi-{slug}-factsheet-.pdf") for slug, name in SBI_FUNDS.items()]
CURATED.append(("SBI", SBIAdapter, "SBI Contra Fund", BASE + "sbi-contra-fund-factsheet-17fae076-7a0e-4e87-b82c-ab217d24ee3a.pdf?sfvrsn=d591624_2"))


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
    rows, audit, src_files = [], [], []
    seen = set()

    for amc, AdapterCls, fund_base, url in CURATED:
        rec = {"amc": amc, "fund": fund_base, "url": url, "status": "ok", "codes": 0}
        try:
            pdf = fetch(url)
            m = AdapterCls().parse_scheme_block(pdf_text(pdf))
        except Exception as e:  # noqa: BLE001
            rec.update(status="failed", error=str(e)[:80])
            audit.append(rec)
            continue
        src_files.append({"source": f"{amc} factsheet PDF", "source_url": url, "amc": amc,
                          "scheme_hint": fund_base, "sha256": hashlib.sha256(pdf).hexdigest(),
                          "byte_size": len(pdf), "source_date": m.source_date})
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
    os.makedirs("data/warehouse", exist_ok=True)
    with open("data/warehouse/source_files.jsonl", "a") as fh:   # append-only lineage + checksum
        for s in src_files:
            fh.write(json.dumps(s) + "\n")
    print(f"-- ingested {len(rows)} scheme rows from {sum(1 for a in audit if a['status']=='ok')} factsheets", file=sys.stderr)
    for a in audit:
        print(f"   {a['fund']:28} {a['status']:7} codes={a.get('codes',0)} src={a.get('source_date','-')}", file=sys.stderr)

    # Phase 6/7 (institutional data-depth sprint): archive this run's parsed metadata as a
    # versioned snapshot, so a future re-parse can diff against it and produce real
    # fund_history_events. Optional and additive — never blocks or fails the local JSON write
    # above, which is this script's actual job; only runs when Supabase credentials happen to be
    # present (CI), same graceful-skip pattern as scripts/ingest_news.py.
    if os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_ROLE_KEY"):
        try:
            archive_snapshot()
        except Exception as e:
            print(f"  ! factsheet archive snapshot failed (non-fatal): {e}", file=sys.stderr)
    else:
        print("  (SUPABASE_SERVICE_ROLE_KEY not set — skipping factsheet archive snapshot)", file=sys.stderr)

    # Data Platform Mission 4: field-level provenance (sql/neon/004_metadata_provenance.sql).
    # Same graceful-skip pattern as archive_snapshot() above — never blocks or fails this
    # script's real job (the metadata.json write already happened by this point).
    if os.environ.get("DATABASE_URL"):
        try:
            stats = record_provenance(src_files, rows)
            print(f"  provenance: {stats['documents']} documents, {stats['versions']} versions, "
                  f"{stats['extractions']} extractions, {stats['validations']} validations", file=sys.stderr)
        except Exception as e:
            print(f"  ! provenance recording failed (non-fatal): {e}", file=sys.stderr)
    else:
        print("  (DATABASE_URL not set — skipping provenance recording)", file=sys.stderr)


if __name__ == "__main__":
    main()
