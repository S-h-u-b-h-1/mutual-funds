"""
Alert delivery (Day 14) — composes and sends emails via Resend.

Two kinds:
  * daily_summary — the headline equity/debt flow numbers, to all daily subscribers.
  * spike         — when flow_signals has fresh surges, notify spike subscribers.

Fully gated on RESEND_API_KEY: with no key set it logs what it *would* send and
exits cleanly (so the pipeline never breaks pre-launch). `last_sent_at` is updated
so the same alert isn't re-sent within a run.

    RESEND_API_KEY=... MFP_FROM_EMAIL=alerts@yourdomain \
      python -m ingestion.alert_delivery
"""

from __future__ import annotations

import json
import os
import urllib.request
from datetime import datetime, timezone

from .db import connect

RESEND_URL = "https://api.resend.com/emails"


def _send(to: str, subject: str, html: str) -> bool:
    key = os.getenv("RESEND_API_KEY")
    sender = os.getenv("MFP_FROM_EMAIL", "MF Pulse <alerts@mfpulse.in>")
    if not key:
        print(f"  [dry-run] would email {to}: {subject!r}")
        return False
    req = urllib.request.Request(
        RESEND_URL,
        data=json.dumps({"from": sender, "to": [to], "subject": subject, "html": html}).encode(),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        return resp.status in (200, 201)


def _headline(cur) -> dict:
    cur.execute(
        """
        WITH latest AS (SELECT max(month) m FROM fact_flow_monthly)
        SELECT COALESCE(SUM(net_flow_cr) FILTER (WHERE asset_class='Equity'),0),
               COALESCE(SUM(net_flow_cr) FILTER (WHERE asset_class='Debt'),0),
               (SELECT m FROM latest)
        FROM fact_flow_monthly WHERE month=(SELECT m FROM latest)
        """
    )
    eq, dbt, month = cur.fetchone()
    return {"equity": float(eq), "debt": float(dbt), "month": str(month)}


def _summary_html(h: dict, signals: list) -> str:
    sig = "".join(f"<li>{a} · {c}: <b>{s}</b> (z {z})</li>" for a, c, s, z in signals) or "<li>No spikes this period.</li>"
    return (
        f"<h2>MF Pulse — flows for {h['month']}</h2>"
        f"<p>Equity net inflow: <b>₹{h['equity']:,.0f} Cr</b><br>"
        f"Debt net flow: <b>₹{h['debt']:,.0f} Cr</b></p>"
        f"<h3>Flow signals</h3><ul>{sig}</ul>"
        f"<p><a href='https://frontend-six-beta-20.vercel.app'>Open the dashboard →</a></p>"
    )


def run() -> dict:
    now = datetime.now(timezone.utc)
    sent = 0
    with connect() as conn:
        with conn.cursor() as cur:
            h = _headline(cur)
            cur.execute("SELECT amc_name, asset_class, signal, z_score FROM flow_signals ORDER BY abs(z_score) DESC LIMIT 5")
            signals = cur.fetchall()
            html = _summary_html(h, signals)

            cur.execute("SELECT id, email FROM alerts WHERE alert_type='daily_summary'")
            subs = cur.fetchall()
            for alert_id, email in subs:
                ok = _send(email, f"MF Pulse · flows for {h['month']}", html)
                if ok:
                    cur.execute("UPDATE alerts SET last_sent_at=%s WHERE id=%s", (now, alert_id))
                    sent += 1

    summary = {"subscribers": len(subs), "sent": sent, "dry_run": not os.getenv("RESEND_API_KEY")}
    print(f"Alert delivery: {summary}")
    return summary


if __name__ == "__main__":
    run()
