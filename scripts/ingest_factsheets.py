"""
Real factsheet ingestion — downloads legitimate AMC factsheet PDFs, parses them with the
implemented adapters, matches scheme codes against the AMFI universe, validates, and writes
real metadata (with lineage: source_url + source_date) to frontend/app/data/metadata.json.

Only confidently-extracted values are stored; missing fields stay null; stale factsheets are
flagged by source_date. Nothing is fabricated.

Data Platform Mission 5: generalized beyond SBI. Two acquisition shapes coexist in SOURCES
below, matched to how each AMC's site actually works (found by testing, not assumed uniform):
  - "per_scheme" (SBI): one small PDF per fund. parse_scheme_block() returns ONE partial row
    per URL, which then gets matched against every AMFI plan/option variant whose name starts
    with the curated human label.
  - "combined" (HDFC): one PDF covers every active scheme. The adapter's own parse() already
    returns one partial row PER real scheme with scheme_name read straight from the PDF text —
    each of those rows goes through the exact same AMFI-matching step individually.
Adding a third AMC means adding one SOURCES entry, not a new script.

    .venv/bin/python -m scripts.ingest_factsheets
"""

from __future__ import annotations

import dataclasses
import datetime
import hashlib
import io
import json
import os
import sys
import urllib.request

import pypdf

from ingestion.amfi_parser import parse_file
from ingestion.factsheet.adapters.sbi import SBIAdapter
from ingestion.factsheet.adapters.hdfc import HDFCAdapter
from ingestion.factsheet.normalize import validate, completeness, collapse
from ingestion.factsheet.provenance import record_provenance
from scripts.archive_factsheets import archive_snapshot

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36"
SBI_BASE = "https://www.sbimf.com/docs/default-source/scheme-factsheets/"

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
SBI_ITEMS = [(name, SBI_BASE + f"sbi-{slug}-factsheet-.pdf") for slug, name in SBI_FUNDS.items()]
SBI_ITEMS.append(("SBI Contra Fund", SBI_BASE + "sbi-contra-fund-factsheet-17fae076-7a0e-4e87-b82c-ab217d24ee3a.pdf?sfvrsn=d591624_2"))

SOURCES = [
    {"amc": "SBI", "shape": "per_scheme", "adapter": SBIAdapter, "items": SBI_ITEMS},
    # fund_base is None here on purpose: HDFCAdapter.parse() returns one row per real scheme
    # already named from the PDF text, so there's no curated per-fund label to pass — see
    # ingestion/factsheet/adapters/hdfc.py's module docstring for why this AMC needs its own
    # acquisition shape instead of SBI's per-scheme URL list.
    {"amc": "HDFC", "shape": "combined", "adapter": HDFCAdapter, "items": [(None, HDFCAdapter().factsheet_url())]},
]


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


def _match_and_collect(m, fund_base, dim, seen, rows):
    """Match one AMC-level partial SchemeMetadata (benchmark/manager/AUM/etc. already filled
    in, scheme_code/scheme_name not yet) against every AMFI plan/option variant whose collapsed
    name starts with the collapsed fund_base, and append one fully-resolved row per match.
    Returns how many new codes this call added, for the per-source audit count."""
    base = collapse(fund_base)
    added = 0
    for r in dim:
        if r.scheme_code in seen or not collapse(r.scheme_name).startswith(base):
            continue
        seen.add(r.scheme_code)
        mm = dataclasses.replace(m, scheme_code=r.scheme_code, scheme_name=r.scheme_name)
        if validate(mm):
            continue
        row = dataclasses.asdict(mm)
        row["completeness"] = completeness(mm)
        rows.append(row)
        added += 1
    return added


def main():
    dim = list(parse_file("data/NAVAll.txt"))   # materialize — it's a generator, reused per fund
    rows, audit, src_files = [], [], []
    seen = set()

    for src in SOURCES:
        amc, shape, AdapterCls = src["amc"], src["shape"], src["adapter"]
        for fund_base, url in src["items"]:
            rec = {"amc": amc, "fund": fund_base or f"{amc} (combined factsheet)", "url": url, "status": "ok", "codes": 0}
            try:
                pdf = fetch(url)
            except Exception as e:  # noqa: BLE001
                rec.update(status="failed", error=str(e)[:80])
                audit.append(rec)
                continue

            try:
                if shape == "per_scheme":
                    partials = [(fund_base, AdapterCls().parse_scheme_block(pdf_text(pdf)))]
                else:  # combined — the adapter names each row itself from the PDF text
                    partials = [(m.scheme_name, m) for m in AdapterCls().parse(pdf) if m.scheme_name]
            except Exception as e:  # noqa: BLE001
                rec.update(status="failed", error=str(e)[:80])
                audit.append(rec)
                continue

            codes = 0
            for hint, m in partials:
                src_files.append({"source": f"{amc} factsheet PDF", "source_url": url, "amc": amc,
                                  "scheme_hint": hint, "sha256": hashlib.sha256(pdf).hexdigest(),
                                  "byte_size": len(pdf), "source_date": m.source_date})
                m.source = f"{amc} factsheet PDF"
                m.source_url = url
                codes += _match_and_collect(m, hint, dim, seen, rows)
            rec["codes"] = codes
            rec["source_date"] = partials[0][1].source_date if partials else None
            audit.append(rec)

    by_amc = {}
    for r in rows:
        by_amc.setdefault(r["amc"], 0)
        by_amc[r["amc"]] += 1

    out = {
        "asOf": datetime.date.today().isoformat(), "source": "AMC factsheet PDFs (official)",
        "adapters": len(SOURCES), "parser_ready": len(SOURCES),
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
