import os
import pytest


def pytest_sessionstart(session):
    if os.getenv("MFPULSE_CI_DATABASE_GUARD") == "1":
        from scripts.ci_database_guard import main
        try:
            main()
        except (Exception, SystemExit):
            pytest.exit("CI database identity preflight failed; no tests executed", returncode=1)
