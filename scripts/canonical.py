"""
Fund-family normalization (Attention Layer Phase 1).

Collapses the 4+ plan/option variants of one fund (Direct/Regular × Growth/IDCW) into one
canonical investment idea. Deterministic — derived from the scheme name only.

    SBI Small Cap Fund - Direct Plan - Growth   ─┐
    SBI Small Cap Fund - Regular Plan - Growth   ├─► canonical: "SBI Small Cap Fund"
    SBI Small Cap Fund - Direct Plan - IDCW      ┘

    .venv/bin/python -m scripts.canonical    # writes data/warehouse/fund_family.json + report
"""

from __future__ import annotations

import json
import re

# everything from the first plan/option marker onward is a variant suffix
_CUT = re.compile(
    r"\s*[-–]\s*(?:Direct|Regular|Growth|IDCW|Income\s+Distribution|Dividend|Bonus|Payout|Reinvest|Plan\b).*$",
    re.I,
)
_TAIL = re.compile(r"\s*[-–]\s*(?:Growth|IDCW|Dividend|Bonus|Payout)\s*$", re.I)


def canonical_display(name: str) -> str:
    """Human-readable canonical fund name (variant suffix stripped)."""
    n = _CUT.sub("", name).strip()
    n = _TAIL.sub("", n).strip().rstrip("-").strip()
    # normalise whitespace + a couple of common spacing artefacts
    return re.sub(r"\s{2,}", " ", n)


def canonical_key(name: str) -> str:
    """Stable grouping key (case/space/`&`-insensitive)."""
    return canonical_display(name).lower().replace("&", "and").replace("-", " ").replace("  ", " ").strip()


def build_mapping(records):
    """records: iterable with .scheme_code, .scheme_name, .amc_name → dict keyed by canonical_key."""
    fam = {}
    for r in records:
        key = canonical_key(r.scheme_name)
        e = fam.setdefault(key, {"canonical_fund_id": key.replace(" ", "-"),
                                 "canonical_fund_name": canonical_display(r.scheme_name),
                                 "amc": r.amc_name.replace(" Mutual Fund", ""),
                                 "variant_scheme_codes": []})
        e["variant_scheme_codes"].append(r.scheme_code)
        # prefer a Title-cased display name over an ALL-CAPS one
        if r.scheme_name.upper() != r.scheme_name:
            e["canonical_fund_name"] = canonical_display(r.scheme_name)
    for e in fam.values():
        e["variant_count"] = len(e["variant_scheme_codes"])
    return fam


def main():
    from ingestion.amfi_parser import parse_file
    dim = list(parse_file("data/NAVAll.txt"))
    fam = build_mapping(dim)
    with open("data/warehouse/fund_family.json", "w") as fh:
        json.dump(fam, fh, separators=(",", ":"))

    total_codes = sum(e["variant_count"] for e in fam.values())
    multi = [e for e in fam.values() if e["variant_count"] > 1]
    reduction = round(100 * (1 - len(fam) / total_codes), 1)
    report = [
        "# MF Pulse — Fund Family Mapping Report (Attention Layer Phase 1)",
        f"\n_As of NAVAll. Deterministic name-based normalization._\n",
        f"- Scheme codes (variants): **{total_codes:,}**",
        f"- Canonical funds: **{len(fam):,}**",
        f"- **Variant reduction: {reduction}%** ({total_codes:,} → {len(fam):,})",
        f"- Funds with >1 variant: {len(multi):,}",
        f"- Avg variants per canonical fund: {round(total_codes / len(fam), 2)}",
        "\n## Examples (most variants)",
        "| Canonical fund | AMC | Variants |", "|---|---|---|",
    ]
    for e in sorted(fam.values(), key=lambda x: -x["variant_count"])[:12]:
        report.append(f"| {e['canonical_fund_name']} | {e['amc']} | {e['variant_count']} |")
    open("docs/FUND_FAMILY_MAPPING_REPORT.md", "w").write("\n".join(report))
    print(f"-- {total_codes:,} codes → {len(fam):,} canonical funds (reduction {reduction}%)")


if __name__ == "__main__":
    main()
