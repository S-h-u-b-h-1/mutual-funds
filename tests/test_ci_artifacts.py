from zipfile import ZIP_DEFLATED, ZipFile

import pytest
from scripts.check_ci_artifacts import assert_clean

FAKE_URL = "postgresql://example:fake-ci-password@localhost/test"


def test_clean_artifact(tmp_path):
    (tmp_path / "results.json").write_text('{"passed":42}')
    assert_clean([tmp_path], FAKE_URL)


@pytest.mark.parametrize("payload", [FAKE_URL, "fake-ci-password"])
def test_credential_in_plain_file_is_rejected(tmp_path, payload):
    (tmp_path / "results.json").write_text(payload)
    with pytest.raises(ValueError, match="upload is forbidden"):
        assert_clean([tmp_path], FAKE_URL)


def test_credential_in_compressed_trace_is_rejected(tmp_path):
    with ZipFile(tmp_path / "trace.zip", "w", compression=ZIP_DEFLATED) as archive:
        archive.writestr("nested/trace.network", FAKE_URL)
    with pytest.raises(ValueError, match="upload is forbidden"):
        assert_clean([tmp_path], FAKE_URL)


def test_missing_credential_fails_closed(tmp_path):
    with pytest.raises(ValueError):
        assert_clean([tmp_path], "")
