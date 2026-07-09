import os, tempfile, importlib
import pytest
from fastapi.testclient import TestClient

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

# --- PART A: personal-best baseline fix (plan 2026-06-30, executed 2026-07-09) ---

def _log_session(client, day, sets):
    """sets: list of (exercise_id, exercise_name, reps, weight_kg). Returns sid."""
    sid = client.post("/api/sessions", json={"workout_day": day}).json()["id"]
    for i, (eid, ename, reps, w) in enumerate(sets, start=1):
        client.post(f"/api/sessions/{sid}/sets", json={
            "exercise_id": eid, "exercise_name": ename,
            "set_number": i, "reps": reps, "weight_kg": w})
    client.patch(f"/api/sessions/{sid}", json={"completed": True})
    return sid

def test_first_ever_exercise_is_baseline_not_pr(client):
    sid = _log_session(client, "upper_a", [("bench", "Bench Press", 8, 60.0)])
    prs = client.get(f"/api/sessions/{sid}/prs").json()
    types = [p["type"] for p in prs]
    assert "baseline" in types
    assert "weight" not in types and "reps" not in types and "1rm" not in types
    baseline = next(p for p in prs if p["type"] == "baseline")
    assert baseline["exercise_name"] == "Bench Press"

def test_first_completed_session_has_no_volume_pr(client):
    sid = _log_session(client, "upper_a", [("bench", "Bench Press", 8, 60.0)])
    prs = client.get(f"/api/sessions/{sid}/prs").json()
    assert "volume" not in [p["type"] for p in prs]

def test_second_session_beating_baseline_is_a_pr(client):
    _log_session(client, "upper_a", [("bench", "Bench Press", 8, 60.0)])
    sid2 = _log_session(client, "upper_a", [("bench", "Bench Press", 8, 65.0)])
    prs = client.get(f"/api/sessions/{sid2}/prs").json()
    types = [p["type"] for p in prs]
    assert "weight" in types and "baseline" not in types
    weight = next(p for p in prs if p["type"] == "weight")
    assert weight["value"] == 65.0

def test_new_top_weight_gives_weight_pr_only_no_reps_pr(client):
    # Baseline at 60kg, then a brand-new top weight of 65kg.
    _log_session(client, "upper_a", [("bench", "Bench Press", 8, 60.0)])
    sid2 = _log_session(client, "upper_a", [("bench", "Bench Press", 5, 65.0)])
    prs = client.get(f"/api/sessions/{sid2}/prs").json()
    types = [p["type"] for p in prs]
    assert "weight" in types
    assert "reps" not in types  # no prior reps at 65kg to beat
