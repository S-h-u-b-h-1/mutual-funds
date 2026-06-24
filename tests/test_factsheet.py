"""Factsheet-intelligence tests — benchmark mapping, normalize/validate, registry/audit."""
from datetime import date

from ingestion.benchmarks import resolve_benchmark
from ingestion.factsheet.normalize import SchemeMetadata, SectorAllocation, completeness, validate
from ingestion.factsheet.registry import ADAPTERS, implemented_amcs


def test_benchmark_standard_categories():
    assert resolve_benchmark("Large Cap")[0] == "NIFTY 100 TRI"
    assert resolve_benchmark("Mid Cap")[0] == "NIFTY Midcap 150 TRI"
    assert resolve_benchmark("Small Cap")[0] == "NIFTY Smallcap 250 TRI"
    assert resolve_benchmark("Large Cap")[1] is True          # marked standard


def test_benchmark_thematic_flagged_not_forced():
    bm, std = resolve_benchmark("Sectoral/Thematic", "ICICI Pru Technology Fund")
    assert std is False and "varies" in bm.lower()
    # unknown diversified default is flagged non-standard, not wrong
    assert resolve_benchmark("Some New Category")[1] is False


def test_completeness_and_no_fabrication():
    empty = SchemeMetadata(scheme_code="1", scheme_name="X Fund", amc="X")
    assert completeness(empty) == 0.0                          # nothing invented
    full = SchemeMetadata(scheme_code="1", scheme_name="X", amc="X", benchmark="NIFTY 100 TRI",
                          fund_manager="A", expense_ratio=0.8, aum_crores=1000, riskometer="High")
    assert completeness(full) == 1.0


def test_validate_catches_bad_values():
    bad = SchemeMetadata(scheme_code="1", scheme_name="X", amc="X", expense_ratio=9.9)
    assert any("expense_ratio" in p for p in validate(bad))
    over = SchemeMetadata(scheme_code="1", scheme_name="X", amc="X",
                          sector_allocation=[SectorAllocation("Fin", 80), SectorAllocation("IT", 40)])
    assert any("sector" in p for p in validate(over))
    assert validate(SchemeMetadata(scheme_code="1", scheme_name="X", amc="X")) == []


def test_metadata_row_serializable():
    m = SchemeMetadata(scheme_code="1", scheme_name="X", amc="X", launch_date=date(2020, 1, 1), source_date=date(2026, 6, 1))
    row = m.to_metadata_row()
    assert "holdings" not in row and row["launch_date"] == "2020-01-01"


def test_registry_is_honest_and_no_fabrication_on_empty_text():
    assert len(ADAPTERS) >= 4
    assert len(implemented_amcs()) == len(ADAPTERS)            # all Big-Four parsers implemented
    # Parsing non-factsheet text must NOT invent any field (offline, no network).
    from ingestion.factsheet.adapters.hdfc import HDFCAdapter
    from ingestion.factsheet.normalize import completeness
    metas = HDFCAdapter().parse_text("this is not a factsheet at all")
    assert all(completeness(m) == 0.0 for m in metas)
