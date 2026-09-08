"""Read-only application schema gate. Reports missing objects, never auto-migrates."""
import json
from ingestion import db

REQUIRED = {
    "portfolio_transactions": {"description", "unit_balance"},
    "portfolio_holdings": {"statement_value", "statement_nav", "statement_nav_date"},
    "portfolio_unresolved_holdings": {"user_id", "raw_scheme_name", "resolution_status", "status"},
    "investor_profiles": {"phone_number"},
    "nominees": {"sequence"},
    "pep_declarations": {"user_id", "declared", "status"},
    "fatca_declarations": {"user_id", "tax_residency_country", "status"},
    "consent_records": {"user_id", "consent_type", "version"},
    "investment_accounts": {"provider", "provider_client_reference", "verified_at", "failure_reason"},
    "newsletter_subscriptions": {"email", "status"},
    "schema_baselines": {"id", "schema_checksum", "details"},
}


def missing_objects(conn):
    with conn.cursor() as cur:
        cur.execute("select table_name,column_name from information_schema.columns where table_schema='public'")
        columns = set(cur.fetchall())
        cur.execute("select conname from pg_constraint where conrelid=to_regclass('public.portfolio_transactions')")
        constraints = {row[0] for row in cur.fetchall()}
    missing = sorted(f"{table}.{column}" for table, expected in REQUIRED.items() for column in expected if (table, column) not in columns)
    if "portfolio_transactions_fingerprint_unique" not in constraints:
        missing.append("constraint:portfolio_transactions_fingerprint_unique")
    return missing


def main():
    if not db.neon_enabled():
        raise SystemExit("DATABASE_URL is required; schema gate was not run")
    with db.connect() as conn:
        conn.execute("set transaction read only")
        missing = missing_objects(conn)
    print(json.dumps({"status": "blocked" if missing else "pass", "missing": missing}, indent=2))
    return bool(missing)


if __name__ == "__main__":
    raise SystemExit(main())
