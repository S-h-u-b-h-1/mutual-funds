"""Alerting: failed-run detection, stale detection, channels (fail-safe)."""

from datetime import date

import ingestion.alerting as al

TODAY = date(2026, 6, 24)


def test_alert_for_failed_run():
    d = al.alert_for_run("failed", date(2026, 6, 23))
    assert d is not None and d[2] == "error" and "FAILED" in d[0]


def test_alert_for_stale_nav():
    red = al.alert_for_run("success", date(2026, 6, 16), today=TODAY)  # 8d
    assert red is not None and red[2] == "error" and "stale" in red[0].lower()
    amber = al.alert_for_run("success", date(2026, 6, 20), today=TODAY)  # 4d
    assert amber is not None and amber[2] == "warning"


def test_no_alert_when_fresh():
    assert al.alert_for_run("success", date(2026, 6, 23), today=TODAY) is None  # 1d


def test_alert_for_partial_coverage():
    # 2026-08-11 incident fix: the max date is fresh (0 days old -> would pass the old check
    # silently), but coverage_state="PARTIAL" must still surface a warning, with the real
    # percentage in the message.
    d = al.alert_for_run("success", date(2026, 6, 24), today=TODAY, coverage_state="PARTIAL", coverage_pct=0.0006)
    assert d is not None
    subject, message, severity = d
    assert severity == "warning"
    assert "incomplete" in subject.lower()
    assert "0%" in message or "0.1%" in message


def test_no_alert_when_coverage_current():
    assert al.alert_for_run("success", date(2026, 6, 23), today=TODAY, coverage_state="CURRENT", coverage_pct=0.98) is None


def test_send_alert_github_only(capsys):
    sent = al.send_alert("Test", "msg", "error")
    assert sent == ["github"]
    assert "::error::" in capsys.readouterr().out


def test_send_alert_slack(monkeypatch):
    calls = []
    monkeypatch.setenv("SLACK_WEBHOOK_URL", "https://hooks.slack/x")
    monkeypatch.setattr(al, "_post", lambda url, payload, timeout=15: calls.append((url, payload)) or 200)
    sent = al.send_alert("Test", "msg", "error")
    assert "slack" in sent and calls and "slack" in calls[0][0]


def test_send_alert_never_raises(monkeypatch):
    monkeypatch.setenv("SLACK_WEBHOOK_URL", "https://x")

    def boom(*a, **k):
        raise RuntimeError("channel down")

    monkeypatch.setattr(al, "_post", boom)
    sent = al.send_alert("Test", "msg")  # must not raise
    assert "github" in sent and "slack" not in sent
