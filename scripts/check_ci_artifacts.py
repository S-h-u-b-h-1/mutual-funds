"""Refuse artifact upload if the test URL/password appears in files or ZIP entries."""
import os
from pathlib import Path
from urllib.parse import unquote, urlsplit
from zipfile import ZipFile


def assert_clean(roots, secret):
    password = unquote(urlsplit(secret).password or "")
    if not secret or not password:
        raise ValueError("Artifact credential scan requires the test credential")
    needles = [value.encode() for value in (secret, password)]

    def inspect(payload):
        if any(needle in payload for needle in needles):
            raise ValueError("Credential detected; artifact upload is forbidden")

    for root in roots:
        for path in Path(root).rglob("*"):
            if not path.is_file():
                continue
            inspect(path.read_bytes())
            if path.suffix == ".zip":
                with ZipFile(path) as archive:
                    for entry in archive.infolist():
                        if entry.file_size > 64 * 1024 * 1024:
                            raise ValueError("Artifact entry exceeds the safe scan limit")
                        inspect(archive.read(entry))


if __name__ == "__main__":
    try:
        assert_clean(["output/playwright/remediation", "frontend/test-results"], os.environ.get("TEST_DATABASE_URL", ""))
    except Exception:
        raise SystemExit("Artifact safety check failed; nothing may be uploaded") from None
    print("Artifact credential scan passed, including compressed browser traces")
