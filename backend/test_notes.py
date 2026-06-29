import os, tempfile, importlib
import pytest
from fastapi.testclient import TestClient

@pytest.fixture
def client(monkeypatch):
    tmp = tempfile.mkdtemp()
    monkeypatch.setenv("DATABASE_URL", os.path.join(tmp, "test.db"))
    import main; importlib.reload(main)
    return TestClient(main.app)

def test_notes_upsert_get_delete(client):
    assert client.get("/api/notes").json() == {}
    client.put("/api/exercises/bench_press/note", json={"note": "Pause at chest"})
    assert client.get("/api/notes").json() == {"bench_press": "Pause at chest"}
    # update
    client.put("/api/exercises/bench_press/note", json={"note": "Elbows tucked"})
    assert client.get("/api/notes").json()["bench_press"] == "Elbows tucked"
    # empty deletes
    client.put("/api/exercises/bench_press/note", json={"note": "   "})
    assert client.get("/api/notes").json() == {}
