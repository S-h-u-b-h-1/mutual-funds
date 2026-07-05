"""
Live data guarantee (P0 go-live sprint, Phase 9) — asserts the freshness CHAIN is intact, not
just that each stage individually succeeded. A stage can "succeed" while quietly falling behind
the stage before it (e.g. analytics refreshed against yesterday's NAV) — this only catches that
by comparing stages against each other, using real timestamps, every run.

Chain checked (mission spec): NAV -> analytics -> JSON bundle. Deploy-vs-build is checked
separately in production-refresh.yml's own "verify production" step, since it needs the live
site, not just local files.

Rules:
  - NAV more than GREEN_MAX (2) days stale -> WARNING only (weekends/holidays are expected gaps;
    ingestion/freshness.py's own threshold, not invented here).
  - fact_system_health snapshot older than the real NAV data -> FAIL (analytics didn't run, or
    ran before ingestion finished).
  - Committed JSON bundle (daily.json's asOf) older than fact_system_health's nav date -> FAIL
    (bundles weren't rebuilt after the DB changed).

Never silent: every check prints its cause and the exact value compared, pass or fail.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.request
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from ingestion.freshness import is_stale, staleness_days, GREEN_MAX  # noqa: E402

URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")


def _get(path):
    req = urllib.request.Request(f"{URL}/rest/v1/{path}", headers={"apikey": KEY, "Authorization": f"Bearer {KEY}"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def main():
    if not URL or not KEY:
        print("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — cannot check the freshness chain.", file=sys.stderr)
        return 1

    # Use the Equity-anchored latest NAV date (trading day) to avoid weekend forward-date mismatches
    nav_rows = _get("mv_asset_class_summary?asset_class=eq.Equity&select=latest_nav_date&order=latest_nav_date.desc&limit=1")
    if nav_rows and nav_rows[0].get("latest_nav_date"):
        nav_latest = date.fromisoformat(nav_rows[0]["latest_nav_date"])
    else:
        fallback_rows = _get("fact_nav_daily?select=nav_date&order=nav_date.desc&limit=1")
        nav_latest = date.fromisoformat(fallback_rows[0]["nav_date"]) if fallback_rows else None

    health_rows = _get("fact_system_health?select=nav_latest_date,captured_at&order=captured_at.desc&limit=1")
    health_nav = date.fromisoformat(health_rows[0]["nav_latest_date"]) if health_rows and health_rows[0]["nav_latest_date"] else None

    bundle_path = os.path.join(ROOT, "frontend/app/data/daily.json")
    bundle_asof = None
    if os.path.exists(bundle_path):
        with open(bundle_path) as fh:
            bundle_asof = date.fromisoformat(json.load(fh)["asOf"])

    ok = True

    days = staleness_days(nav_latest)
    if nav_latest is None:
        print("::error::NAV freshness — no fact_nav_daily rows at all. Cause: warehouse empty. Location: fact_nav_daily. Fix: run the ingestion pipeline.")
        ok = False
    elif is_stale(nav_latest):
        print(f"::warning::NAV freshness — latest NAV is {nav_latest} ({days}d old, threshold {GREEN_MAX}d). Not failing: could be a genuine non-trading day.")
    else:
        print(f"OK: NAV freshness — latest NAV {nav_latest} ({days}d old).")

    if nav_latest is not None:
        if health_nav is None:
            print("::error::Analytics vs NAV — fact_system_health has no snapshot at all. Cause: refresh_analytics()/health-snapshot step never ran or failed. Location: scripts/cloud_pipeline.py. Fix: check that step's logs for this run.")
            ok = False
        elif health_nav < nav_latest:
            print(f"::error::Analytics vs NAV — fact_system_health reflects {health_nav}, but real NAV data is already at {nav_latest}. Cause: analytics refresh ran before ingestion finished, or failed silently. Location: scripts/cloud_pipeline.py's refresh_analytics() call. Fix: re-run the pipeline; if this recurs, check step ordering.")
            ok = False
        else:
            print(f"OK: Analytics vs NAV — fact_system_health ({health_nav}) is caught up with NAV ({nav_latest}).")

    if health_nav is not None:
        if bundle_asof is None:
            print("::error::JSON bundle vs analytics — frontend/app/data/daily.json is missing or unparseable. Cause: bundle rebuild never ran or failed. Location: scripts/build_daily.py. Fix: re-run the bundle rebuild step.")
            ok = False
        elif bundle_asof < health_nav:
            print(f"::error::JSON bundle vs analytics — daily.json says asOf={bundle_asof}, but analytics already knows about {health_nav}. Cause: build_daily.py ran before this ingestion finished, or wasn't re-run after it. Location: scripts/build_daily.py. Fix: re-run steps 3 (rebuild bundles) after step 1 (NAV ingestion) completes.")
            ok = False
        else:
            print(f"OK: JSON bundle vs analytics — daily.json ({bundle_asof}) is caught up with analytics ({health_nav}).")

    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
