import os
import pytest


def pytest_sessionstart(session):
    if os.getenv("MFPULSE_CI_DATABASE_GUARD") == "1":
        from scripts.ci_database_guard import main
        try:
            main()
        except (Exception, SystemExit):
            pytest.exit("CI database identity preflight failed; no tests executed", returncode=1)


def pytest_sessionfinish(session, exitstatus):
    if os.getenv("MFPULSE_CI_DATABASE_GUARD") == "1":
        reporter = session.config.pluginmanager.get_plugin("terminalreporter")
        if reporter and reporter.stats.get("skipped"):
            reporter.write_sep("=", "CI release gate refuses skipped tests")
            session.exitstatus = pytest.ExitCode.TESTS_FAILED
