"""Fail-closed, read-only target validation for Python CI connections."""
import os
from urllib.parse import urlsplit, parse_qs, unquote

EXPECTED = {
    "project": "super-surf-43536488", "branch": "br-weathered-star-atigraez",
    "endpoint": "ep-bitter-union-atj8og0c", "database": "neondb", "role": "mf_pulse_ci_20260908",
}
HOST = "ep-bitter-union-atj8og0c.c-9.us-east-1.aws.neon.tech"


def assert_url():
    try:
        value = os.environ["DATABASE_URL"]
        url = urlsplit(value)
        if (value != os.environ["TEST_DATABASE_URL"] or url.scheme not in ("postgres", "postgresql")
                or url.hostname.replace("-pooler.", ".") != HOST or url.path != "/neondb"
                or unquote(url.username or "") != EXPECTED["role"] or "options" in parse_qs(url.query)):
            raise ValueError()
    except Exception:
        raise RuntimeError("CI database URL does not identify the approved isolated target and role") from None


def assert_connection(conn):
    try:
        row = conn.execute("""select current_setting('neon.project_id',true),
            current_setting('neon.branch_id',true), current_setting('neon.endpoint_id',true),
            current_database(), current_user""").fetchone()
        if tuple(row) != tuple(EXPECTED.values()):
            raise ValueError()
    except Exception:
        raise RuntimeError("CI database connected identity check failed") from None


def safe_failure_category(error):
    """Fixed labels only: driver messages can contain credentials or connection strings."""
    message = str(error).lower()
    if "root certificate file" in message and "does not exist" in message:
        return "TLS CA bundle unavailable"
    if "server certificate for" in message:
        return "TLS hostname mismatch"
    if "certificate" in message or "sslrootcert" in message:
        return "TLS certificate verification"
    if getattr(error, "sqlstate", None) == "28P01":
        return "authentication rejected"
    if isinstance(error, RuntimeError):
        return "connected identity mismatch"
    return "connection unavailable"


def main():
    import psycopg
    assert_url()
    try:
        with psycopg.connect(os.environ["TEST_DATABASE_URL"], connect_timeout=15) as conn:
            assert_connection(conn)
    except Exception as error:
        raise SystemExit(f"CI database preflight failed ({safe_failure_category(error)}); no tests may run") from None
    print("CI database identity verified: approved project, test branch, endpoint, database and CI role")


if __name__ == "__main__":
    main()
