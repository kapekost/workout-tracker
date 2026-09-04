"""Shared fixtures — every test file used to re-declare these (5 copies)."""
import os, json, tempfile, importlib
import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def mainmod(monkeypatch):
    tmp = tempfile.mkdtemp()
    monkeypatch.setenv("DATABASE_URL", os.path.join(tmp, "test.db"))
    import main
    importlib.reload(main)  # re-run init() against the temp DB
    return main


@pytest.fixture
def client(mainmod):
    return TestClient(mainmod.app)


@pytest.fixture
def write_backup_status(mainmod):
    """Drop a backup-status.json where /api/health reads it.

    scripts/backup.sh writes this next to the DB, in the volume the app already
    mounts. Pass a dict for the normal cases, or raw text for a malformed file.
    """
    def _write(body):
        path = os.path.join(os.path.dirname(mainmod.DB_PATH), "backup-status.json")
        with open(path, "w") as f:
            f.write(body if isinstance(body, str) else json.dumps(body))
        return path
    return _write
