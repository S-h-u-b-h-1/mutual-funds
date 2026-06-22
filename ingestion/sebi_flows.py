"""
SEBI / AMFI monthly net-flow ingestion -> fact_flow_monthly.

Real monthly net inflow/outflow is published by SEBI (monthly bulletin) and AMFI
(monthly newsletter) only as PDF/Excel — there is NO clean public .txt/CSV/JSON
endpoint (verified 2026-06-21: AMFI's AAUM module is POST-only and returns Excel,
SEBI returns PDFs). So this loader ingests a normalised CSV that you export once
per month from that report:

    amc_name,asset_class,category,month,inflow_cr,outflow_cr,aum_cr

`data/flows_seed.csv` ships a clearly-labelled SAMPLE month so the dashboard
headline renders end-to-end before the real export is wired in.

    python -m ingestion.sebi_flows data/flows_seed.csv
"""

from __future__ import annotations

import csv
import sys

from .db import connect


def load_csv(path: str) -> list[tuple]:
    rows: list[tuple] = []
    with open(path, newline="") as fh:
        for r in csv.DictReader(fh):
            inflow = float(r["inflow_cr"])
            outflow = float(r["outflow_cr"])
            rows.append(
                (
                    r["amc_name"].strip(),
                    r["asset_class"].strip(),
                    (r.get("category") or "").strip() or None,
                    r["month"].strip(),
                    inflow,
                    outflow,
                    round(inflow - outflow, 2),
                    float(r["aum_cr"]) if r.get("aum_cr") else None,
                )
            )
    return rows


def run(path: str) -> int:
    rows = load_csv(path)
    if not rows:
        raise RuntimeError(f"No rows parsed from {path}")
    with connect() as conn:
        with conn.cursor() as cur:
            cur.executemany(
                """
                INSERT INTO fact_flow_monthly
                    (amc_name, asset_class, category, month, inflow_cr, outflow_cr, net_flow_cr, aum_cr)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (amc_name, asset_class, month) DO UPDATE SET
                    inflow_cr   = EXCLUDED.inflow_cr,
                    outflow_cr  = EXCLUDED.outflow_cr,
                    net_flow_cr = EXCLUDED.net_flow_cr,
                    aum_cr      = EXCLUDED.aum_cr
                """,
                rows,
            )
    print(f"Loaded {len(rows)} monthly-flow rows from {path}")
    return len(rows)


if __name__ == "__main__":
    run(sys.argv[1] if len(sys.argv) > 1 else "data/flows_seed.csv")
