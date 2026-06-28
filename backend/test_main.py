import os, tempfile, importlib
import pytest
from fastapi.testclient import TestClient

@pytest.fixture
def client(monkeypatch):
    tmp = tempfile.mkdtemp()
    monkeypatch.setenv("DATABASE_URL", os.path.join(tmp, "test.db"))
    import main
    importlib.reload(main)  # re-run init() against the temp DB
    return TestClient(main.app)

def test_completing_session_sets_ended_at(client):
    sid = client.post("/api/sessions", json={"workout_day": "upper_a"}).json()["id"]

    created = client.get(f"/api/sessions/{sid}").json()
    assert created["ended_at"] is None

    patched = client.patch(f"/api/sessions/{sid}", json={"completed": True}).json()
    assert patched["completed"] == 1
    assert patched["ended_at"] is not None

    listed = client.get("/api/sessions").json()
    assert any(s["id"] == sid and s["ended_at"] is not None for s in listed)

def test_ended_at_is_stable_on_repeat_complete(client):
    sid = client.post("/api/sessions", json={"workout_day": "upper_a"}).json()["id"]
    first = client.patch(f"/api/sessions/{sid}", json={"completed": True}).json()["ended_at"]
    second = client.patch(f"/api/sessions/{sid}", json={"completed": True}).json()["ended_at"]
    assert first == second  # not overwritten on re-complete
