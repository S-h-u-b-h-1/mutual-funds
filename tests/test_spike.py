"""Unit tests for z-score spike detection."""

from ingestion.spike_detect import detect


def _series(amc, cls, nets):
    months = ["2025-12-01", "2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01"]
    return [{"amc_name": amc, "asset_class": cls, "month": m, "net_flow_cr": n} for m, n in zip(months, nets)]


def test_detects_inflow_surge():
    rows = _series("A", "Equity", [100, 110, 105, 95, 100, 600])  # big jump last month
    sigs = detect(rows)
    assert len(sigs) == 1
    assert sigs[0].signal == "inflow_surge"
    assert sigs[0].z_score > 1.8


def test_no_signal_when_stable():
    rows = _series("B", "Equity", [100, 102, 98, 101, 99, 100])
    assert detect(rows) == []


def test_needs_enough_history():
    rows = _series("C", "Debt", [100, 900])[:2]  # only 2 points
    assert detect(rows) == []


def test_outflow_surge_negative_z():
    rows = _series("D", "Debt", [100, 110, 105, 95, 100, -400])
    sigs = detect(rows)
    assert len(sigs) == 1 and sigs[0].signal == "outflow_surge" and sigs[0].z_score < 0
