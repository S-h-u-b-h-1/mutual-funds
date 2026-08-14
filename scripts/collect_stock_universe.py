"""Collect the public NIFTY 50 and BSE 100 constituent universes.

This collector intentionally stores constituent metadata only. It does not fetch prices, index
weights, full filing documents, or any licensed exchange data. Every snapshot keeps its source
URL, source-effective date, retrieval timestamp, checksum, and raw identifiers so a future Neon
membership table can append history instead of silently replacing yesterday's universe.

Run from the repository root:
    python3 -m scripts.collect_stock_universe
"""
from __future__ import annotations

import csv
import argparse
import hashlib
import io
import json
import re
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "frontend" / "app" / "data" / "stock_universe.json"
NIFTY_URL = "https://nsearchives.nseindia.com/content/indices/ind_nifty50list.csv"
BSE_URL = "https://www.bseindices.com/AsiaIndexAPI/api/Codewise_Indices/w?code=22"
NSE_EQUITY_MASTER_URL = "https://archives.nseindia.com/content/equities/EQUITY_L.csv"
UA = "Mozilla/5.0 (compatible; MFPulseResearchBot/1.0; +https://mf-pulse.vercel.app/stocks/sources)"


def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/csv,application/json;q=0.9,*/*;q=0.1"})
    with urllib.request.urlopen(request, timeout=45) as response:
        return response.read()


def checksum(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def parse_nifty(raw: bytes) -> list[dict]:
    rows = list(csv.DictReader(io.StringIO(raw.decode("utf-8-sig"))))
    companies = [
        {
            "name": row["Company Name"].strip(),
            "industry": row["Industry"].strip(),
            "nseSymbol": row["Symbol"].strip(),
            "series": row["Series"].strip(),
            "isin": row["ISIN Code"].strip(),
        }
        for row in rows
    ]
    if len(companies) != 50:
        raise ValueError(f"NIFTY 50 contract failed: expected 50 constituents, received {len(companies)}")
    if len({row["isin"] for row in companies}) != 50:
        raise ValueError("NIFTY 50 contract failed: ISIN values are not unique")
    return sorted(companies, key=lambda row: row["name"])


def parse_bse(raw: bytes) -> tuple[list[dict], str | None]:
    payload = json.loads(raw)
    rows = payload.get("Table") or []
    companies = [
        {
            "name": row["SCRIPNAME"].strip(),
            "industry": row["Industry_name"].strip(),
            "bseCode": str(row["SCRIP_CODE"]).strip(),
        }
        for row in rows
    ]
    if len(companies) != 100:
        raise ValueError(f"BSE 100 contract failed: expected 100 constituents, received {len(companies)}")
    if len({row["bseCode"] for row in companies}) != 100:
        raise ValueError("BSE 100 contract failed: BSE codes are not unique")
    effective_dates = sorted({str(row.get("TransDate") or "")[:10] for row in rows if row.get("TransDate")})
    if len(effective_dates) > 1:
        raise ValueError(f"BSE 100 contract failed: mixed source dates {effective_dates}")
    return sorted(companies, key=lambda row: row["name"]), effective_dates[0] if effective_dates else None


def normalize_company_name(value: str) -> str:
    normalized = value.upper().replace("&", " AND ")
    normalized = re.sub(r"^\s*THE\s+", "", normalized)
    normalized = re.sub(r"\b(?:LTD|LIMITED|CO|COMPANY)\.?\b", " ", normalized)
    return re.sub(r"[^A-Z0-9]+", "", normalized)


def parse_nse_equity_master(raw: bytes) -> list[dict]:
    source_rows = list(csv.DictReader(io.StringIO(raw.decode("utf-8-sig"))))
    companies = []
    for source_row in source_rows:
        row = {key.strip(): value for key, value in source_row.items()}
        symbol = (row.get("SYMBOL") or "").strip()
        name = (row.get("NAME OF COMPANY") or "").strip()
        isin = (row.get("ISIN NUMBER") or "").strip()
        series = (row.get("SERIES") or "").strip()
        if symbol and name and isin and series == "EQ":
            companies.append({"name": name, "nseSymbol": symbol, "isin": isin})
    if len(companies) < 1000:
        raise ValueError(f"NSE equity master contract failed: expected at least 1,000 EQ securities, received {len(companies)}")
    return companies


def enrich_bse_identifiers(bse: list[dict], nse_master: list[dict]) -> tuple[list[dict], int]:
    normalized_master = [(normalize_company_name(row["name"]), row) for row in nse_master]
    enriched = []
    matches = 0
    for company in bse:
        needle = normalize_company_name(company["name"])
        exact_candidates = [row for normalized, row in normalized_master if normalized == needle]
        prefix_candidates = [
            row for normalized, row in normalized_master
            if (
                min(len(normalized), len(needle)) >= 16
                and (normalized.startswith(needle) or needle.startswith(normalized))
            )
        ]
        candidates = exact_candidates if exact_candidates else prefix_candidates
        if len(candidates) == 1:
            company = {**company, "nseSymbol": candidates[0]["nseSymbol"], "isin": candidates[0]["isin"]}
            matches += 1
        enriched.append(company)
    return enriched, matches


def industry_counts(companies: list[dict]) -> list[dict]:
    return [
        {"industry": industry, "count": count}
        for industry, count in sorted(Counter(row["industry"] for row in companies).items(), key=lambda item: (-item[1], item[0]))
    ]


def build_snapshot(nifty_raw: bytes, bse_raw: bytes, nse_equity_master_raw: bytes) -> dict:
    nifty = parse_nifty(nifty_raw)
    bse, bse_effective_date = parse_bse(bse_raw)
    bse, bse_nse_matches = enrich_bse_identifiers(bse, parse_nse_equity_master(nse_equity_master_raw))
    return {
        "schemaVersion": 2,
        "retrievedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "handling": "Constituent metadata only; no price, weight, recommendation or full-document redistribution.",
        "indices": {
            "NIFTY50": {
                "name": "NIFTY 50",
                "provider": "NSE Indices",
                "sourceUrl": NIFTY_URL,
                "sourceChecksumSha256": checksum(nifty_raw),
                "sourceEffectiveDate": None,
                "constituentCount": len(nifty),
                "identifierCoverage": {"isin": len(nifty), "nseSymbol": len(nifty), "bseCode": 0},
                "industryCounts": industry_counts(nifty),
                "constituents": nifty,
            },
            "BSE100": {
                "name": "BSE 100",
                "provider": "BSE Indices",
                "sourceUrl": "https://www.bseindices.com/indices-details/code/22/",
                "sourceEndpoint": BSE_URL,
                "sourceChecksumSha256": checksum(bse_raw),
                "identifierEnrichmentSourceUrl": NSE_EQUITY_MASTER_URL,
                "identifierEnrichmentChecksumSha256": checksum(nse_equity_master_raw),
                "identifierEnrichmentMatches": bse_nse_matches,
                "sourceEffectiveDate": bse_effective_date,
                "constituentCount": len(bse),
                "identifierCoverage": {
                    "isin": sum(1 for row in bse if row.get("isin")),
                    "nseSymbol": sum(1 for row in bse if row.get("nseSymbol")),
                    "bseCode": len(bse),
                },
                "industryCounts": industry_counts(bse),
                "constituents": bse,
            },
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--nifty-file", type=Path, help="Use an already-downloaded official NIFTY CSV")
    parser.add_argument("--bse-file", type=Path, help="Use an already-downloaded official BSE JSON response")
    parser.add_argument("--nse-equity-master-file", type=Path, help="Use an already-downloaded official NSE equity master CSV")
    args = parser.parse_args()
    supplied_files = [args.nifty_file, args.bse_file, args.nse_equity_master_file]
    if any(supplied_files) and not all(supplied_files):
        parser.error("--nifty-file, --bse-file and --nse-equity-master-file must be supplied together")
    nifty_raw = args.nifty_file.read_bytes() if args.nifty_file else fetch(NIFTY_URL)
    bse_raw = args.bse_file.read_bytes() if args.bse_file else fetch(BSE_URL)
    nse_equity_master_raw = args.nse_equity_master_file.read_bytes() if args.nse_equity_master_file else fetch(NSE_EQUITY_MASTER_URL)
    snapshot = build_snapshot(nifty_raw, bse_raw, nse_equity_master_raw)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(snapshot, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(
        f"Collected {snapshot['indices']['NIFTY50']['constituentCount']} NIFTY 50 and "
        f"{snapshot['indices']['BSE100']['constituentCount']} BSE 100 constituents "
        f"({snapshot['indices']['BSE100']['identifierEnrichmentMatches']} NSE identifier matches) -> {OUTPUT}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
