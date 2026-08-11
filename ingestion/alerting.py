"""
Production alerting (fail-safe, multi-channel).

Channels, all opt-in via env vars, all best-effort (never raise):
  * GitHub Actions annotation — always emitted; surfaces in the run summary and
    turns the workflow output red/yellow.
  * Slack            — SLACK_WEBHOOK_URL  (incoming webhook).
  * Generic webhook  — ALERT_WEBHOOK_URL  (JSON POST; use with email relays like
                       Zapier/Make/Resend-proxy, PagerDuty Events, etc.).

    from ingestion.alerting import send_alert
    send_alert("Daily NAV ingestion FAILED", "HTTP 500 from AMFI", "error")
"""

from __future__ import annotations

import json
import os
import sys
import urllib.request


def _post(url: str, payload: dict, timeout: int = 15) -> int:
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"}, method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status


def github_annotation(message: str, severity: str = "error") -> None:
    """Emit a GitHub Actions ::error:: / ::warning:: annotation."""
    level = "error" if severity == "error" else "warning"
    # Single-line; GitHub strips newlines in annotations.
    print(f"::{level}::{message.replace(chr(10), ' ')}")


def slack_payload(subject: str, message: str, severity: str) -> dict:
    icon = ":rotating_light:" if severity == "error" else ":warning:"
    return {"text": f"{icon} *MF Pulse* — {subject}\n{message}"}


def alert_for_run(status: str, latest=None, today=None, coverage_state=None, coverage_pct=None):
    """Decide if a pipeline run warrants an alert.

    Returns (subject, message, severity) or None. Pure + testable: covers the
    four trigger conditions — failed run, missing data, stale NAV, and (2026-08-11 incident fix)
    a technically-current-but-incomplete ingestion. `coverage_state`/`coverage_pct` are optional
    (callers that haven't computed coverage yet, e.g. old tests, still get the original checks)
    — see ingestion/freshness.py's classify_freshness() for how they're produced.
    """
    from ingestion.freshness import freshness_status, staleness_days

    if status != "success":
        return ("Daily NAV ingestion FAILED", "run did not complete successfully", "error")
    if latest is None:
        return ("NAV data missing", "no NAV date present in the load", "error")
    fresh = freshness_status(latest, today)
    if fresh != "green":
        return (
            "NAV data is stale",
            f"latest NAV {latest} is {staleness_days(latest, today)} days old (status: {fresh})",
            "error" if fresh == "red" else "warning",
        )
    # The 2026-08-11 incident: MAX(nav_date) was today's date (fresh == "green" above), but only
    # 5 of ~8,500 normally-active schemes actually had it — a single-date check alone can never
    # see this. coverage_state carries that missing dimension.
    if coverage_state == "PARTIAL":
        pct = f"{coverage_pct:.0%}" if coverage_pct is not None else "an unknown fraction of"
        return (
            "NAV ingestion is incomplete",
            f"latest NAV date {latest} exists, but only {pct} of the normal scheme universe has it yet "
            "— AMFI likely hasn't finished publishing for this date. Not a failure; expect the next "
            "scheduled run to catch up.",
            "warning",
        )
    return None


def send_alert(subject: str, message: str, severity: str = "error") -> list[str]:
    """Send an alert to every configured channel. Returns the channels reached."""
    sent: list[str] = []

    try:
        github_annotation(f"{subject} — {message}", severity)
        sent.append("github")
    except Exception:
        pass

    slack = os.getenv("SLACK_WEBHOOK_URL")
    if slack:
        try:
            _post(slack, slack_payload(subject, message, severity))
            sent.append("slack")
        except Exception as e:
            print(f"slack alert failed: {e}", file=sys.stderr)

    hook = os.getenv("ALERT_WEBHOOK_URL")
    if hook:
        try:
            _post(hook, {
                "subject": f"MF Pulse alert: {subject}",
                "message": message, "severity": severity, "source": "mfpulse-pipeline",
            })
            sent.append("webhook")
        except Exception as e:
            print(f"webhook alert failed: {e}", file=sys.stderr)

    return sent
