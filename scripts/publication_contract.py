"""Coverage gates and a checksum manifest for reproducible public research publications."""
import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

METRICS = ("r1m", "r3m", "r6m", "r1y", "r3y", "r5y", "vol90")


def coverage_for(funds):
    eligible = [f for f in funds.values() if f.get("active") and not f.get("isIdcw")]
    return {"eligible": len(eligible), **{key: sum(f.get(key) is not None for f in eligible) for key in METRICS}}


def assert_publication_coverage(funds, previous=None):
    coverage = coverage_for(funds)
    if not coverage["eligible"]:
        raise ValueError("Publication has no eligible schemes")
    # Conservative initial floors cover old enough active schemes without pretending every
    # new fund has five years of history. Relative gates also catch partial regressions.
    floors = {"r1m": .50, "r3m": .45, "r6m": .40, "r1y": .35, "r3y": .20, "r5y": .10, "vol90": .40}
    for key, floor in floors.items():
        ratio = coverage[key] / coverage["eligible"]
        if ratio < floor:
            raise ValueError(f"Publication coverage failed: {key} {ratio:.1%} < {floor:.0%}")
        if previous and previous.get("eligible"):
            old_ratio = previous.get(key, 0) / previous["eligible"]
            if old_ratio and ratio < old_ratio * .85:
                raise ValueError(f"Publication coverage regressed >15% for {key}")
    return coverage


def write_manifest(directory="frontend/app/data"):
    root = Path(directory)
    fund_data = json.loads((root / "funds.json").read_text())
    previous_path = root / "publication.json"
    previous = json.loads(previous_path.read_text()).get("requiredCoverage") if previous_path.exists() else None
    coverage = assert_publication_coverage(fund_data["funds"], previous)
    outputs = {}
    for name in ("funds.json", "performance.json", "metadata.json", "daily.json", "amc_trend.json", "fieldCoverage.json"):
        path = root / name
        if path.exists():
            raw = path.read_bytes()
            outputs[name] = {"sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw)}
    checksum = hashlib.sha256(json.dumps(outputs, sort_keys=True).encode()).hexdigest()
    manifest = {"schemaVersion": 1, "publicationId": f"{fund_data['asOf']}-{checksum[:12]}",
                "createdAt": datetime.now(timezone.utc).isoformat(), "sourceAsOf": fund_data["asOf"],
                "source": "AMFI official NAV publication and history", "sourceRowCounts": fund_data.get("coverage", {}),
                "outputRowCounts": {"funds": len(fund_data["funds"])}, "outputs": outputs,
                "checksum": checksum, "requiredCoverage": coverage, "pipelineStatus": "verified",
                "buildCommit": subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()}
    previous_path.write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest


if __name__ == "__main__":
    print(json.dumps(write_manifest(), indent=2))
