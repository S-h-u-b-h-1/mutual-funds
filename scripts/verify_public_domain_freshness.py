"""Verify mf-pulse.vercel.app actually reflects the latest successful refresh — the exact
question this whole incident was about. Reusable standalone check: run it by hand, or from
Production Refresh (see step 7 of .github/workflows/production-refresh.yml).

Checks, in order:
  1. Reads the bundle's own asOf (frontend/app/data/daily.json) — what THIS refresh produced.
  2. Calls https://mf-pulse.vercel.app/api/freshness — what the public domain is actually serving.
  3. Confirms the public domain's asOf matches the bundle's asOf.
  4. If --expected-sha is given (the commit this refresh produced), also confirms the domain's
     deployedCommitSha matches exactly — a date match alone doesn't prove it's THIS deployment,
     just a deployment with the same asOf.

Exits 0 only if every check passes. Never prints secret values (doesn't touch any).

Usage:
  python -m scripts.verify_public_domain_freshness [--expected-sha SHA] [--retries N] [--wait SECONDS] [--initial-wait SECONDS]
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request

DOMAIN_URL = "https://mf-pulse.vercel.app/api/freshness"


def bundle_asof() -> str:
    with open("frontend/app/data/daily.json") as f:
        return json.load(f)["asOf"]


def fetch_domain_freshness() -> dict:
    req = urllib.request.Request(DOMAIN_URL, headers={"User-Agent": "mfpulse-verify/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--expected-sha", default=None, help="Commit SHA this refresh produced — verified against the domain's deployedCommitSha if given")
    ap.add_argument("--retries", type=int, default=5)
    ap.add_argument("--wait", type=int, default=45, help="Seconds between retries")
    ap.add_argument("--initial-wait", type=int, default=0, help="Seconds to wait before the first attempt (deploy propagation)")
    args = ap.parse_args()

    expected_asof = bundle_asof()
    print(f"Expecting {DOMAIN_URL} to report asOf={expected_asof}" + (f", deployedCommitSha={args.expected_sha}" if args.expected_sha else ""))

    if args.initial_wait:
        time.sleep(args.initial_wait)

    body: dict = {}
    for attempt in range(1, args.retries + 1):
        try:
            body = fetch_domain_freshness()
        except (urllib.error.URLError, json.JSONDecodeError) as e:
            print(f"Attempt {attempt}/{args.retries}: fetch failed — {e}")
            body = {}
        else:
            live_asof = body.get("asOf", "")
            live_sha = body.get("deployedCommitSha")
            asof_ok = live_asof == expected_asof
            sha_ok = args.expected_sha is None or live_sha == args.expected_sha
            if asof_ok and sha_ok:
                print(f"Verified: {DOMAIN_URL} reports asOf={live_asof}" + (f", deployedCommitSha={live_sha}" if args.expected_sha else "") + " — matches.")
                if body.get("explanation"):
                    print(f"  {body['explanation']}")
                return 0
            print(f"Attempt {attempt}/{args.retries}: public domain reports asOf={live_asof!r}, deployedCommitSha={live_sha!r} — not yet matching.")
        if attempt != args.retries:
            time.sleep(args.wait)

    print(
        f"::error::mf-pulse.vercel.app did not match after {args.retries} attempts "
        f"(got asOf={body.get('asOf', '?')!r}, deployedCommitSha={body.get('deployedCommitSha', '?')!r}; "
        f"expected asOf={expected_asof!r}" + (f", deployedCommitSha={args.expected_sha!r}" if args.expected_sha else "") + "). "
        f"Cause: the domain alias did not update to the latest deployment, or propagation is taking "
        f"longer than usual. Location: Vercel dashboard -> project mutual-funds -> Settings -> Domains "
        f"-> mf-pulse.vercel.app; also check the most recent Production Refresh run's "
        f"'Point mf-pulse.vercel.app' step for the exact Vercel API error. "
        f"Fix: confirm VERCEL_TOKEN/VERCEL_ORG_ID/VERCEL_PROJECT_ID are still valid, or re-run the workflow."
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
