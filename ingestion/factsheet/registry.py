"""Adapter registry — maps an AMC name to its factsheet adapter."""

from __future__ import annotations

from .adapters.sbi import SBIAdapter
from .adapters.hdfc import HDFCAdapter
from .adapters.icici import ICICIAdapter
from .adapters.nippon import NipponAdapter

ADAPTERS = {a.amc_name: a for a in (SBIAdapter, HDFCAdapter, ICICIAdapter, NipponAdapter)}


def get_adapter(amc_name: str):
    return ADAPTERS.get(amc_name)


def implemented_amcs() -> list[str]:
    return [name for name, cls in ADAPTERS.items() if getattr(cls, "implemented", False)]
