"""Migration regression tests (Completion Sprint Phase 1). Guards against exactly the class of
bug found and fixed 2026-07-15: 005_research_profile.sql was applied to production with column
names reconstructed from memory instead of read from the file, producing a schema that silently
mismatched the API route that reads/writes it (every save/load call 500'd until caught and
corrected via 006_research_profile_column_fix.sql). These tests assert the LIVE database schema
— not the SQL files, which could themselves be stale — matches what the application code actually
depends on. Skips (not fails) when DATABASE_URL isn't set, matching the existing
scripts/compare_supabase_neon_counts.py convention: schema regression needs a real database, and
absence of one locally is a normal dev-environment state, not a failure.

Run: DATABASE_URL=... python -m pytest tests/test_migrations.py -v
"""
import re
from pathlib import Path

import pytest

from ingestion import db as neon_db

ROOT = Path(__file__).resolve().parents[1]
pytestmark = pytest.mark.skipif(not neon_db.neon_enabled(), reason="DATABASE_URL not set — no live database to check schema against")


def _columns(conn, table):
    with conn.cursor() as cur:
        cur.execute(
            "select column_name from information_schema.columns where table_name = %s order by ordinal_position",
            (table,),
        )
        return [row[0] for row in cur.fetchall()]


def _constraint_defs(conn, table):
    with conn.cursor() as cur:
        cur.execute(
            "select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = %s::regclass",
            (table,),
        )
        return {row[0]: row[1] for row in cur.fetchall()}


def _index_names(conn, table):
    with conn.cursor() as cur:
        cur.execute("select indexname from pg_indexes where tablename = %s", (table,))
        return {row[0] for row in cur.fetchall()}


# ---------------------------------------------------------------- 004_metadata_provenance.sql

PROVENANCE_TABLES = {
    "source_documents": ["id", "amc", "document_type", "scheme_hint", "canonical_url", "discovery_method", "created_at"],
    "source_document_versions": ["id", "source_document_id", "fetched_url", "published_date", "fetched_at", "raw_content_sha256", "byte_size", "format_valid", "created_at"],
    "parser_versions": ["id", "parser_name", "version_label", "code_ref", "created_at"],
    "source_extractions": ["id", "scheme_code", "raw_scheme_identifier", "field_name", "raw_value", "normalized_value", "unit", "source_document_version_id", "page_number", "table_reference", "extraction_method", "parser_version_id", "extracted_at", "confidence", "is_current", "limitations"],
    "field_validation_results": ["id", "source_extraction_id", "check_name", "passed", "detail", "checked_at"],
    "metadata_quarantine": ["id", "source_extraction_id", "reason", "quarantined_at", "reviewed", "reviewed_at", "resolution"],
    "fact_factsheet_runs": ["run_id", "amc", "as_of_date", "status", "schemes_found", "schemes_populated", "problems", "source_url", "started_at", "finished_at", "document_type", "parser_version_id"],
}


@pytest.mark.parametrize("table,expected_columns", PROVENANCE_TABLES.items())
def test_provenance_table_columns(table, expected_columns):
    with neon_db.connect() as conn:
        actual = _columns(conn, table)
    assert actual, f"{table} does not exist (004_metadata_provenance.sql not applied?)"
    assert set(expected_columns) <= set(actual), f"{table} missing columns: {set(expected_columns) - set(actual)}"


def test_provenance_key_constraints_and_indexes():
    with neon_db.connect() as conn:
        se_indexes = _index_names(conn, "source_extractions")
        sd_indexes = _index_names(conn, "source_documents")
        se_constraints = _constraint_defs(conn, "source_extractions")

    # The two unique indexes that replaced invalid table-level UNIQUE(coalesce(...)) constraints —
    # see 004_metadata_provenance.sql's header comment. Losing either silently reopens the
    # duplicate-current-row / duplicate-source-document bugs that made these indexes necessary.
    assert "ux_source_extractions_current" in se_indexes
    assert "ux_source_documents_identity" in sd_indexes
    assert any("confidence" in d and "high" in d for d in se_constraints.values()), "source_extractions.confidence CHECK constraint missing or changed"


def test_provenance_views_are_queryable():
    with neon_db.connect() as conn:
        with conn.cursor() as cur:
            cur.execute("select count(*) from fund_metadata_values")
            cur.execute("select count(*) from fund_metadata_history")


# ---------------------------------------------------------------- 005/006_research_profile.sql

def test_research_profile_table_exists_with_correct_columns():
    with neon_db.connect() as conn:
        actual = set(_columns(conn, "research_profile"))
    # The exact bug this test exists to catch: an earlier apply of 005 used goal/experience_level/
    # risk_comfort_label/horizon_band/free_text_categories instead of these names, and every
    # research-profile API call 500'd until 006_research_profile_column_fix.sql corrected it.
    expected = {"user_id", "role", "primary_goal", "experience", "risk_comfort", "horizon", "aum_band", "preferred_categories", "created_at", "updated_at"}
    assert actual == expected, f"research_profile columns drifted — expected {expected}, got {actual}"
    stale = {"goal", "experience_level", "risk_comfort_label", "horizon_band", "free_text_categories"}
    assert not (actual & stale), f"research_profile still has pre-006-fix column names: {actual & stale}"


def test_research_profile_matches_api_route_contract():
    """Reads the live schema AND the live route file (not a hardcoded copy of either) so this
    test fails if either side drifts in the future, not just if today's specific bug recurs."""
    route_path = ROOT / "frontend/app/api/v1/sync/research-profile/route.js"
    source = route_path.read_text()
    match = re.search(r"const COLUMNS = \{([^}]+)\};", source)
    assert match, f"could not find COLUMNS mapping in {route_path} — has the route been restructured?"
    api_columns = set(re.findall(r':\s*"([a-z_]+)"', match.group(1)))
    assert api_columns, f"parsed zero columns out of COLUMNS mapping in {route_path}"

    with neon_db.connect() as conn:
        db_columns = set(_columns(conn, "research_profile"))

    assert api_columns <= db_columns, f"route.js expects columns the live table doesn't have: {api_columns - db_columns}"


def test_research_profile_constraints():
    with neon_db.connect() as conn:
        constraints = _constraint_defs(conn, "research_profile")
    defs = " ".join(constraints.values())
    assert "PRIMARY KEY (user_id)" in defs
    assert "REFERENCES users(id)" in defs and "ON DELETE CASCADE" in defs
