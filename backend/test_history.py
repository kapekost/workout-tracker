import os, tempfile, importlib
import pytest
from fastapi.testclient import TestClient

def _session(client, day, sets, complete=True):
    sid = client.post("/api/sessions", json={"workout_day": day}).json()["id"]
    for i, (ex, w, r) in enumerate(sets, 1):
        client.post(f"/api/sessions/{sid}/sets",
                    json={"exercise_id": ex, "exercise_name": ex, "set_number": i, "reps": r, "weight_kg": w})
    if complete:
        client.patch(f"/api/sessions/{sid}", json={"completed": True})
    return sid

def test_last_returns_prior_completed_sets_excluding_active(client):
    _session(client, "upper_a", [("bench_press", 80, 8), ("bench_press", 80, 8)])
    active = _session(client, "upper_a", [("bench_press", 82, 6)], complete=False)
    r = client.get(f"/api/exercises/bench_press/last?exclude_session={active}").json()
    assert r["sets"] == [
        {"set_number": 1, "weight_kg": 80, "reps": 8},
        {"set_number": 2, "weight_kg": 80, "reps": 8}]
    assert client.get("/api/exercises/never/last").json() is None

def test_session_prs_detects_types(client):
    _session(client, "upper_a", [("bench_press", 80, 8)])           # prior best
    sid = _session(client, "upper_a", [("bench_press", 85, 8)])     # new weight + 1rm
    prs = client.get(f"/api/sessions/{sid}/prs").json()
    types = {p["type"]: p for p in prs}
    assert types["weight"]["value"] == 85 and types["weight"]["exercise_name"] == "bench_press"
    assert "1rm" in types
    assert "volume" in types  # 85*8=680 > 80*8=640
