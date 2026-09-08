"""The CI workflow must not restore production database/API credentials by fallback."""
import re
from pathlib import Path

import yaml

SOURCE = (Path(__file__).resolve().parents[1] / ".github/workflows/ci.yml").read_text()
WORKFLOW = yaml.safe_load(SOURCE)


def test_ci_uses_only_the_approved_test_secret():
    assert set(re.findall(r"secrets\.([A-Z_]+)", SOURCE)) == {"TEST_DATABASE_URL"}
    assert WORKFLOW["env"]["MFPULSE_CI_DATABASE_GUARD"] == "1"


def test_ci_public_mirror_cannot_reach_production():
    expected = {
        "NEXT_PUBLIC_SUPABASE_URL": "http://127.0.0.1:54321",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY": "ci-only-unconfigured-public-mirror",
    }
    for key, value in expected.items():
        assert WORKFLOW["env"][key] == value
        for job in WORKFLOW["jobs"].values():
            assert key not in job.get("env", {})
            assert all(key not in step.get("env", {}) for step in job["steps"])


def test_database_jobs_guard_identity_before_tests():
    for name in ("backend-tests", "frontend-tests", "browser-regression"):
        steps = WORKFLOW["jobs"][name]["steps"]
        commands = [step.get("run", "") for step in steps]
        guard = next(i for i, command in enumerate(commands) if "ci_database_guard" in command or "check-test-database.mjs" in command)
        run = next(i for i, command in enumerate(commands) if "pytest tests/" in command or "npm test" in command or "npm run test:e2e" in command)
        assert guard < run


def test_artifact_upload_requires_a_successful_secret_scan():
    steps = WORKFLOW["jobs"]["browser-regression"]["steps"]
    scan = next(i for i, step in enumerate(steps) if step.get("id") == "artifact-secrets")
    upload = next(i for i, step in enumerate(steps) if step.get("uses", "").startswith("actions/upload-artifact@"))
    assert scan < upload
    assert "steps.artifact-secrets.outcome == 'success'" in steps[upload]["if"]
