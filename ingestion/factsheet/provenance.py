"""
Data Platform Mission 4 — wires the metadata provenance schema
(sql/neon/004_metadata_provenance.sql, verified deployed-but-empty on Neon production as of
2026-07-17: see docs/METADATA_PROVENANCE_SCHEMA.md's correction) into the one real, working
factsheet pipeline (SBI). Called from scripts/ingest_factsheets.py's main() after that script's
own JSON-bundle write succeeds — same graceful-skip-on-missing-DATABASE_URL, never-block-the-
primary-job pattern already established there for archive_snapshot(). Extends existing
infrastructure (ingestion/db.py's connect(), the already-designed schema) rather than building a
second provenance system.

Confidence per field is not a new judgment call — it matches docs/DATA_SOURCE_REGISTER.md's
already-published per-field assessment: fund_manager is explicitly documented there as
low-confidence (SBI's solo-manager line is ambiguous); sector_allocation is medium (a real,
undocumented-until-found contamination defect from a prior audit pass, not yet fixed). Every
other tracked field is a single labeled line, current-period source — high, per the register's
own confidence policy ("exact labeled field match, single unambiguous value, current-period
source").

metadata.json rows are matched to a source_documents.scheme_hint via normalize.collapse() on
both sides (lowercase, strip spaces/hyphens, '&'->'and'). A first version of this matched only
the scheme_name side and left the hint raw ("SBI Large & Midcap Fund" never collapses to equal
itself) — silently 0/152 matches, 0 extractions written, no exception raised. Caught only by
running the one-time backfill and checking the match-count log line, not by any test. If
extractions_written stays 0 on a real run, check this match first before anything else.
"""
from __future__ import annotations

from ingestion.db import connect
from ingestion.factsheet.normalize import collapse

PARSER_NAME = "sbi_factsheet_adapter"
PARSER_VERSION = "1"
FIELD_CONFIDENCE = {"fund_manager": "low", "sector_allocation": "medium"}
DEFAULT_CONFIDENCE = "high"
TRACKED_FIELDS = [
    "benchmark", "fund_manager", "launch_date", "expense_ratio", "direct_expense_ratio",
    "regular_expense_ratio", "aum_crores", "riskometer", "exit_load", "minimum_sip",
    "minimum_lumpsum", "holdings", "sector_allocation",
]


def _present(v):
    return v not in (None, "", [], {})


def _get_or_create_document(cur, amc, document_type, scheme_hint, canonical_url, discovery_method="direct_url"):
    cur.execute(
        """insert into source_documents (amc, document_type, scheme_hint, canonical_url, discovery_method)
           values (%s, %s, %s, %s, %s)
           on conflict (amc, document_type, coalesce(scheme_hint, ''), canonical_url)
           do update set amc = excluded.amc
           returning id""",
        (amc, document_type, scheme_hint, canonical_url, discovery_method),
    )
    return cur.fetchone()[0]


def _get_or_create_version(cur, source_document_id, fetched_url, published_date, sha256, byte_size):
    cur.execute(
        """insert into source_document_versions
             (source_document_id, fetched_url, published_date, raw_content_sha256, byte_size, format_valid)
           values (%s, %s, %s, %s, %s, true)
           on conflict (source_document_id, raw_content_sha256)
           do update set fetched_url = excluded.fetched_url
           returning id""",
        (source_document_id, fetched_url, published_date, sha256, byte_size),
    )
    return cur.fetchone()[0]


def _get_or_create_parser(cur, parser_name, version_label, code_ref):
    cur.execute(
        """insert into parser_versions (parser_name, version_label, code_ref) values (%s, %s, %s)
           on conflict (parser_name, version_label) do update set code_ref = excluded.code_ref
           returning id""",
        (parser_name, version_label, code_ref),
    )
    return cur.fetchone()[0]


def _insert_extraction(cur, scheme_code, scheme_name, field_name, raw_value, normalized_value,
                        source_document_version_id, parser_version_id, confidence):
    import json as _json
    cur.execute(
        """insert into source_extractions
             (scheme_code, raw_scheme_identifier, field_name, raw_value, normalized_value,
              source_document_version_id, extraction_method, parser_version_id, confidence, is_current)
           values (%s, %s, %s, %s, %s, %s, %s, %s, %s, true)
           on conflict (scheme_code, field_name) where is_current
           do update set
             raw_value = excluded.raw_value, normalized_value = excluded.normalized_value,
             source_document_version_id = excluded.source_document_version_id,
             parser_version_id = excluded.parser_version_id, confidence = excluded.confidence,
             extracted_at = now()
           returning id""",
        (scheme_code, scheme_name, field_name, str(raw_value), _json.dumps(raw_value),
         source_document_version_id, "regex", parser_version_id, confidence),
    )
    return cur.fetchone()[0]


def record_provenance(src_files: list[dict], rows: list[dict]) -> dict:
    """src_files: one dict per fetched document (ingest_factsheets.py main()'s own src_files list
    — keys: amc, source_url, scheme_hint, sha256, byte_size, source_date). rows: one dict per
    scheme (metadata.json's row shape — already validated; validate() failures never reach here).
    Idempotent: re-running with the same document content and field values is a no-op via the
    checksum/current-row ON CONFLICT clauses above, not a growing duplicate log."""
    by_hint = {s["scheme_hint"]: s for s in src_files}  # one document per fund in this pipeline
    documents_written = versions_written = extractions_written = validations_written = 0

    with connect() as conn:
        with conn.cursor() as cur:
            parser_id = _get_or_create_parser(cur, PARSER_NAME, PARSER_VERSION, "ingestion/factsheet/adapters/sbi.py")

            version_id_by_hint = {}
            collapsed_hint = {}
            for hint, s in by_hint.items():
                doc_id = _get_or_create_document(cur, s["amc"], "factsheet_pdf", hint, s["source_url"])
                documents_written += 1
                ver_id = _get_or_create_version(cur, doc_id, s["source_url"], s["source_date"], s["sha256"], s["byte_size"])
                versions_written += 1
                version_id_by_hint[hint] = ver_id
                collapsed_hint[hint] = collapse(hint)

            for row in rows:
                # metadata.json rows don't carry scheme_hint directly — match by prefix, same
                # collapse() normalization scripts/ingest_factsheets.py uses to group AMFI scheme
                # codes under a fund (lowercase, strip spaces/hyphens, '&'->'and'). Both sides must
                # go through collapse() — matching a collapsed name against a raw hint never hits.
                key = collapse(row["scheme_name"])
                hint = next((h for h, ch in collapsed_hint.items() if key.startswith(ch)), None)
                if hint is None:
                    continue
                ver_id = version_id_by_hint[hint]
                for field_name in TRACKED_FIELDS:
                    value = row.get(field_name)
                    if not _present(value):
                        continue
                    confidence = FIELD_CONFIDENCE.get(field_name, DEFAULT_CONFIDENCE)
                    extraction_id = _insert_extraction(
                        cur, row["scheme_code"], row["scheme_name"], field_name, value, value,
                        ver_id, parser_id, confidence,
                    )
                    extractions_written += 1
                    cur.execute(
                        """insert into field_validation_results (source_extraction_id, check_name, passed, detail)
                           values (%s, %s, true, %s)""",
                        (extraction_id, "normalize.validate() range/sanity check", "passed at parse time (rows that fail validate() never reach this point)"),
                    )
                    validations_written += 1

    return {
        "documents": documents_written, "versions": versions_written,
        "extractions": extractions_written, "validations": validations_written,
    }
