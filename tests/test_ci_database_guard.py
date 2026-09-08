import pytest
from scripts.ci_database_guard import EXPECTED, HOST, assert_url, assert_connection, safe_failure_category


def test_approved_url(monkeypatch):
    value = f"postgresql://{EXPECTED['role']}:dummy@{HOST}/neondb"
    monkeypatch.setenv("DATABASE_URL", value)
    monkeypatch.setenv("TEST_DATABASE_URL", value)
    assert_url()


@pytest.mark.parametrize("value", [
    "postgresql://ci:dummy@ep-autumn-wind-atiwaldh.c-9.us-east-1.aws.neon.tech/neondb",
    f"postgresql://wrong:dummy@{HOST}/neondb",
    f"postgresql://{EXPECTED['role']}:dummy@{HOST}/wrong",
    f"postgresql://{EXPECTED['role']}:dummy@{HOST}/neondb?options=spoof",
    "not-a-url",
])
def test_reject_unapproved_url(monkeypatch, value):
    monkeypatch.setenv("DATABASE_URL", value)
    monkeypatch.setenv("TEST_DATABASE_URL", value)
    with pytest.raises(RuntimeError):
        assert_url()


class Connection:
    def __init__(self, row):
        self.row = row

    def execute(self, sql):
        assert "current_setting" in sql
        return self

    def fetchone(self):
        return self.row


def test_approved_connected_identity():
    assert_connection(Connection(tuple(EXPECTED.values())))


@pytest.mark.parametrize("position", range(5))
def test_connected_identity_fails_closed(position):
    row = list(EXPECTED.values())
    row[position] = None
    with pytest.raises(RuntimeError):
        assert_connection(Connection(row))


@pytest.mark.parametrize("error, category", [
    (Exception("root certificate missing postgresql://private:secret@example/db"), "TLS certificate verification"),
    (RuntimeError("private identity details"), "connected identity mismatch"),
    (Exception("postgresql://private:secret@example/db"), "connection unavailable"),
])
def test_failure_category_does_not_disclose_driver_details(error, category):
    assert safe_failure_category(error) == category
