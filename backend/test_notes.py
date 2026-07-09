import os, tempfile, importlib
import pytest
from fastapi.testclient import TestClient

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
