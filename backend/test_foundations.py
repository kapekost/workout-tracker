import os, tempfile, importlib
import pytest
from fastapi.testclient import TestClient

@pytest.fixture
def mainmod(monkeypatch):
    tmp = tempfile.mkdtemp()
    monkeypatch.setenv("DATABASE_URL", os.path.join(tmp, "test.db"))
    import main; importlib.reload(main)
    return main

@pytest.fixture
def client(mainmod):
    return TestClient(mainmod.app)

def test_connection_pragmas_are_set(mainmod):
    with mainmod.db() as conn:
        assert conn.execute("PRAGMA journal_mode").fetchone()[0].lower() == "wal"
        assert conn.execute("PRAGMA foreign_keys").fetchone()[0] == 1
        assert conn.execute("PRAGMA busy_timeout").fetchone()[0] == 5000
