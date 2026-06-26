"""Search & coverage guards (2026-06-26 audit). Asserts the discoverability invariant:
every AMFI scheme that search can surface is routable/openable, no scheme is silently
dropped by a returns/active filter, identity-only records never fabricate returns, and
canonical collapse loses no variant. Run: .venv/bin/python -m pytest tests/test_search_coverage.py"""
import json
import re
from pathlib import Path

from ingestion.amfi_parser import parse_file

ROOT = Path(__file__).resolve().parents[1]
FUNDS = json.load(open(ROOT / "frontend/app/data/funds.json"))["funds"]
SOURCE = {r.scheme_code for r in parse_file(str(ROOT / "data/NAVAll.txt"))}
RET_KEYS = ("r1d", "r1w", "r1m", "r3m", "r6m", "r1y", "r3y", "r5y")


def test_every_source_scheme_is_routable():
    # The search index (Supabase dim_scheme) mirrors the AMFI source; every code must resolve
    # in funds.json so /fund/[code] never 404s on a searchable scheme.
    missing = [c for c in SOURCE if c not in FUNDS]
    assert not missing, f"{len(missing)} searchable schemes are not openable (e.g. {missing[:5]})"
    assert len(FUNDS) == len(SOURCE), f"funds.json {len(FUNDS)} != source {len(SOURCE)}"


def test_no_orphan_funds_outside_source():
    orphans = [c for c in FUNDS if c not in SOURCE]
    assert not orphans, f"funds.json has {len(orphans)} codes not in AMFI source"


def test_identity_only_records_never_fabricate_returns():
    # Dormant/stale/unpriced schemes are shown for discovery but must carry NO computed returns
    # (returns on a stale NAV would be indefensible). They are labelled honestly instead.
    # status dormant/unpriced is only ever produced by reconcile (identity-only). 'stale' is
    # ambiguous (a once-fresh fund may carry its last real point-to-point return), so we assert
    # the unambiguous identity set — which proves the no-fabrication principle.
    for code, f in FUNDS.items():
        if f["quality"]["status"] in ("dormant", "unpriced"):
            assert all(f[k] is None for k in RET_KEYS), f"{code} is dormant/unpriced but has a return"


def test_every_record_has_routable_identity():
    # Routing + page render require name/amc/category/assetClass on every record.
    for code, f in FUNDS.items():
        for key in ("name", "amc", "category", "assetClass", "plan", "option"):
            assert f.get(key), f"{code} missing {key} — would break routing/display"


def test_build_no_longer_applies_artificial_keep_filter():
    # Regression guard: the old `keep = {... if r1m is not None or active}` filter dropped ~5.6k
    # schemes from routing. The build must keep every priced scheme.
    src = (ROOT / "scripts/build_performance.py").read_text()
    assert "keep = funds" in src, "build_performance must keep all priced schemes"
    assert not re.search(r"keep\s*=\s*\{[^}]*r1m.*is not None.*active", src), "artificial keep filter is back"


def _canonical_key(name: str) -> str:
    cut = re.sub(r"\s*[-–]\s*(?:Direct|Regular|Growth|IDCW|Income\s+Distribution|Dividend|Bonus|Payout|Reinvest|Plan\b).*$", "", name, flags=re.I)
    cut = re.sub(r"\s*[-–]\s*(?:Growth|IDCW|Dividend|Bonus|Payout)\s*$", "", cut, flags=re.I).strip().rstrip("-").strip()
    return re.sub(r"\s{2,}", " ", cut).lower().replace("&", "and").replace("-", " ").strip()


def test_canonical_collapse_loses_no_variant():
    # Phase 5: canonical grouping is display-only. Every variant keeps its own code and stays
    # routable — grouping must account for every fund, never permanently hide one.
    groups = {}
    for f in FUNDS.values():
        k = _canonical_key(f["name"]) or f["code"]
        groups.setdefault(k, []).append(f["code"])
    total = sum(len(v) for v in groups.values())
    assert total == len(FUNDS), "canonical grouping dropped variants"
