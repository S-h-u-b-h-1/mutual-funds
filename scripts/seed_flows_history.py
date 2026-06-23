"""
Generate 6 months of (sample) monthly flow history + spike signals, emit SQL.

Deterministic. Injects a couple of equity inflow spikes in the latest month so
the z-score detector (ingestion.spike_detect) has something to flag. Output is a
small SQL upsert for fact_flow_monthly + flow_signals (load via execute_sql).

    .venv/bin/python -m scripts.seed_flows_history > /tmp/flows_history.sql
"""

from __future__ import annotations

import random

from ingestion.spike_detect import detect

random.seed(42)

# (amc, equity net base, debt net base)
AMCS = [
    ("SBI Mutual Fund", 1900, 1200),
    ("ICICI Prudential Mutual Fund", 1850, -1400),
    ("HDFC Mutual Fund", 1650, -400),
    ("Nippon India Mutual Fund", 1000, -550),
    ("Axis Mutual Fund", 850, -500),
    ("Mirae Asset Mutual Fund", 1150, 120),
    ("Kotak Mahindra Mutual Fund", 720, 200),
]
MONTHS = ["2025-12-01", "2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01"]
SPIKE_AMCS = {"SBI Mutual Fund", "Mirae Asset Mutual Fund"}  # equity surge in latest month


def build_rows() -> list[dict]:
    rows = []
    for amc, eqbase, dbtbase in AMCS:
        for cls, base, aum0 in (("Equity", eqbase, eqbase * 120), ("Debt", dbtbase, abs(dbtbase) * 80 + 200000)):
            for mi, month in enumerate(MONTHS):
                net = base + random.gauss(0, abs(base) * 0.18 or 100)
                if month == MONTHS[-1] and cls == "Equity" and amc in SPIKE_AMCS:
                    net = base * 2.7  # injected surge
                inflow = max(net, 0) + abs(base) * 1.4 + 2000
                outflow = inflow - net
                rows.append({
                    "amc_name": amc, "asset_class": cls, "month": month,
                    "inflow_cr": round(inflow), "outflow_cr": round(outflow),
                    "net_flow_cr": round(net), "aum_cr": round(aum0 * (1 + mi * 0.01)),
                })
    return rows


def main() -> None:
    rows = build_rows()
    signals = detect(rows)

    print("-- monthly flows (6 months, sample)")
    print("INSERT INTO fact_flow_monthly (amc_name,asset_class,category,month,inflow_cr,outflow_cr,net_flow_cr,aum_cr) VALUES")
    print(",\n".join(
        f"('{r['amc_name']}','{r['asset_class']}','{r['asset_class']} Schemes','{r['month']}',"
        f"{r['inflow_cr']},{r['outflow_cr']},{r['net_flow_cr']},{r['aum_cr']})"
        for r in rows
    ))
    print("ON CONFLICT (amc_name,asset_class,month) DO UPDATE SET "
          "inflow_cr=EXCLUDED.inflow_cr,outflow_cr=EXCLUDED.outflow_cr,"
          "net_flow_cr=EXCLUDED.net_flow_cr,aum_cr=EXCLUDED.aum_cr;")

    print("-- spike signals")
    print("DELETE FROM flow_signals;")
    if signals:
        print("INSERT INTO flow_signals (amc_name,asset_class,month,net_flow_cr,z_score,signal) VALUES")
        print(",\n".join(
            f"('{s.amc_name}','{s.asset_class}','{s.month}',{s.net_flow_cr},{s.z_score},'{s.signal}')"
            for s in signals
        ) + ";")
    import sys
    print(f"-- {len(rows)} flow rows, {len(signals)} signals", file=sys.stderr)


if __name__ == "__main__":
    main()
