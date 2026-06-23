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


def derive_class(category: str) -> str:
    c = (category or "").lower()
    if "equity" in c or "elss" in c:
        return "Equity"
    if "debt" in c or "income" in c or "liquid" in c or "gilt" in c or "money market" in c:
        return "Debt"
    if "hybrid" in c or "balanced" in c:
        return "Hybrid"
    if "solution" in c or "retirement" in c:
        return "Solution"
    return "Other"


def _find_col(headers: list[str], *needles: str):
    for i, h in enumerate(headers):
        if any(n in h for n in needles):
            return i
    return None


def load_excel(path: str, month: str, sheet: str | None = None) -> list[tuple]:
    """
    Parse the AMFI/SEBI monthly flow Excel into the same row shape as the CSV path.

    Column detection is by header substring so it survives minor layout changes.
    `month` is the reporting month (the workbook usually encodes it in the filename
    or a title cell, so we pass it explicitly). Recognised headers include:
    AMC / "Mutual Fund Name", "Scheme Category", "Net Inflow/Outflow", AUM.
    """
    from openpyxl import load_workbook

    wb = load_workbook(path, read_only=True, data_only=True)
    ws = wb[sheet] if sheet else wb.active
    rows = list(ws.iter_rows(values_only=True))

    headers = None
    hdr_idx = None
    for i, r in enumerate(rows[:25]):
        cells = [str(c).strip().lower() if c is not None else "" for c in r]
        if _find_col(cells, "amc", "mutual fund") is not None and _find_col(cells, "category", "scheme") is not None:
            headers, hdr_idx = cells, i
            break
    if headers is None:
        raise ValueError(f"Could not locate a header row in {path}")

    c_amc = _find_col(headers, "amc", "mutual fund name", "name of the")
    c_cat = _find_col(headers, "category", "scheme type")
    c_in = _find_col(headers, "inflow", "gross inflow", "sales")
    c_out = _find_col(headers, "outflow", "redemption", "repurchase")
    c_net = _find_col(headers, "net inflow", "net flow", "net")
    c_aum = _find_col(headers, "aum", "assets under management", "net assets")

    def num(r, i):
        if i is None or r[i] in (None, "", "-"):
            return None
        try:
            return float(str(r[i]).replace(",", ""))
        except ValueError:
            return None

    out: list[tuple] = []
    for r in rows[hdr_idx + 1:]:
        if c_amc is None or not r[c_amc] or not str(r[c_amc]).strip():
            continue
        amc = str(r[c_amc]).strip()
        category = str(r[c_cat]).strip() if c_cat is not None and r[c_cat] else ""
        inflow, outflow, net, aum = num(r, c_in), num(r, c_out), num(r, c_net), num(r, c_aum)
        if net is None and inflow is not None and outflow is not None:
            net = inflow - outflow
        if net is None:
            continue
        out.append((amc, derive_class(category), category, month,
                    inflow or 0, outflow or 0, round(net, 2), aum))
    return out


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
