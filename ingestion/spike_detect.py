"""
Flow spike detection (Day 13).

For each (AMC, asset_class), compute the z-score of the latest month's net flow
against its trailing history. |z| >= THRESHOLD is flagged as an inflow/outflow
surge and written to `flow_signals`.

This module is pure (no DB) so it can be unit-tested; the loader feeds it rows
and persists the returned signals. `scripts/seed_flows_history.py` uses it to
emit SQL for the live (sample) dataset.
"""

from __future__ import annotations

from dataclasses import dataclass
from statistics import mean, pstdev

THRESHOLD = 1.8


@dataclass
class Signal:
    amc_name: str
    asset_class: str
    month: str
    net_flow_cr: float
    z_score: float
    signal: str


def detect(rows: list[dict], threshold: float = THRESHOLD) -> list[Signal]:
    """rows: dicts with amc_name, asset_class, month (ISO), net_flow_cr."""
    by_key: dict[tuple, list[dict]] = {}
    for r in rows:
        by_key.setdefault((r["amc_name"], r["asset_class"]), []).append(r)

    signals: list[Signal] = []
    for (amc, cls), series in by_key.items():
        series = sorted(series, key=lambda x: x["month"])
        if len(series) < 4:
            continue
        nets = [float(s["net_flow_cr"]) for s in series]
        hist, latest = nets[:-1], nets[-1]
        m = mean(hist)
        sd = pstdev(hist) or 1.0
        z = (latest - m) / sd
        if abs(z) >= threshold:
            signals.append(
                Signal(
                    amc_name=amc,
                    asset_class=cls,
                    month=series[-1]["month"],
                    net_flow_cr=round(latest, 2),
                    z_score=round(z, 2),
                    signal="inflow_surge" if z > 0 else "outflow_surge",
                )
            )
    signals.sort(key=lambda s: abs(s.z_score), reverse=True)
    return signals
