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

def test_init_is_idempotent_and_versioned(mainmod):
    mainmod.init(); mainmod.init()  # second run must not error
    with mainmod.db() as conn:
        v = conn.execute("PRAGMA user_version").fetchone()[0]
        assert v >= 1
        cols = [r[1] for r in conn.execute("PRAGMA table_info(sessions)").fetchall()]
        assert "ended_at" in cols

def test_existing_rows_survive_reinit(client, mainmod):
    sid = client.post("/api/sessions", json={"workout_day": "upper_a"}).json()["id"]
    mainmod.init()  # re-run migrations on a populated DB
    assert client.get(f"/api/sessions/{sid}").json()["id"] == sid
