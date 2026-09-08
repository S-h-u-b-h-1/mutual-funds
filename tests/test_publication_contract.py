import pytest
import hashlib
import json
from pathlib import Path
from scripts.publication_contract import assert_publication_coverage, METRICS

def test_long_horizon_collapse_blocks_publication():
    funds = {str(i): {"active": True, **{key: 1 for key in METRICS}} for i in range(10)}
    baseline = assert_publication_coverage(funds)
    for fund in funds.values(): fund["r1y"] = None
    with pytest.raises(ValueError, match="r1y"):
        assert_publication_coverage(funds, baseline)

def test_new_funds_do_not_require_nonexistent_history():
    funds = {str(i): {"active": True, **{key: 1 if i < 8 else None for key in METRICS}} for i in range(10)}
    assert assert_publication_coverage(funds)["r5y"] == 8


def test_committed_publication_checksums_and_coverage():
    root = Path(__file__).resolve().parents[1] / "frontend/app/data"
    manifest = json.loads((root / "publication.json").read_text())
    funds = json.loads((root / "funds.json").read_text())
    assert set(manifest["outputs"]) == {"funds.json", "performance.json", "metadata.json", "daily.json", "amc_trend.json", "fieldCoverage.json"}
    for filename, expected in manifest["outputs"].items():
        raw = (root / filename).read_bytes()
        assert hashlib.sha256(raw).hexdigest() == expected["sha256"], filename
        assert len(raw) == expected["bytes"], filename
    checksum = hashlib.sha256(json.dumps(manifest["outputs"], sort_keys=True).encode()).hexdigest()
    assert checksum == manifest["checksum"]
    assert manifest["publicationId"] == f"{funds['asOf']}-{checksum[:12]}"
    assert manifest["sourceAsOf"] == funds["asOf"]
    assert manifest["requiredCoverage"] == assert_publication_coverage(funds["funds"])


def test_public_return_snapshots_share_one_asof():
    root = Path(__file__).resolve().parents[1] / "frontend/app/data"
    dates = {json.loads((root / name).read_text())["asOf"] for name in ("funds.json", "performance.json", "daily.json")}
    assert len(dates) == 1, "Rebuild the daily/performance bundle before publishing a mixed-date candidate"
