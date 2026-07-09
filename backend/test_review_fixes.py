"""Tests for the 2026-07-09 review fixes (CODE-1/2/6/7/9/15/17, PI-7/9)."""
import os, glob, tempfile, importlib
from datetime import date, timedelta
import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def mainmod(monkeypatch):
    tmp = tempfile.mkdtemp()
    monkeypatch.setenv("DATABASE_URL", os.path.join(tmp, "test.db"))
    import main
    importlib.reload(main)
    return main


@pytest.fixture
def client(mainmod):
    return TestClient(mainmod.app)


def _completed_session(client, exercise, weight, day="upper_a", reps=8):
    sid = client.post("/api/sessions", json={"workout_day": day}).json()["id"]
    client.post(f"/api/sessions/{sid}/sets", json={
        "exercise_id": exercise, "exercise_name": exercise.title(),
        "set_number": 1, "reps": reps, "weight_kg": weight})
    client.patch(f"/api/sessions/{sid}", json={"completed": True})
    return sid


# --- CODE-1: CORS middleware removed ---

def test_no_cors_headers_for_cross_origin_requests(client):
    r = client.get("/api/health", headers={"Origin": "http://evil.example"})
    assert "access-control-allow-origin" not in r.headers


# --- CODE-2: progress returns the most recent sessions, not the oldest ---

def test_progress_window_keeps_most_recent_sessions(client, mainmod):
    sids = [_completed_session(client, "bench", 40 + i * 0.5) for i in range(65)]
    # spread distinct dates so recency is unambiguous
    with mainmod.db() as conn:
        for i, sid in enumerate(sids):
            d = (date(2025, 1, 1) + timedelta(days=i)).isoformat()
            conn.execute("UPDATE sessions SET date = ? WHERE id = ?", (d, sid))
        conn.commit()
    rows = client.get("/api/progress/bench").json()
    assert len(rows) == 60
    dates = [r["date"] for r in rows]
    assert dates == sorted(dates)  # still ascending for the chart
    assert dates[-1] == (date(2025, 1, 1) + timedelta(days=64)).isoformat()  # newest kept
    assert (date(2025, 1, 1)).isoformat() not in dates  # oldest dropped


# --- CODE-6: progress only counts completed sessions ---

def test_progress_excludes_incomplete_sessions(client):
    _completed_session(client, "bench", 60)
    sid = client.post("/api/sessions", json={"workout_day": "upper_a"}).json()["id"]
    client.post(f"/api/sessions/{sid}/sets", json={
        "exercise_id": "bench", "exercise_name": "Bench",
        "set_number": 1, "reps": 8, "weight_kg": 100})  # abandoned, never completed
    rows = client.get("/api/progress/bench").json()
    assert len(rows) == 1
    assert rows[0]["max_weight"] == 60


# --- CODE-9: exercise list carries per-exercise completed max in one call ---

def test_all_progress_includes_completed_max_weight(client):
    _completed_session(client, "bench", 60)
    _completed_session(client, "bench", 70)
    sid = client.post("/api/sessions", json={"workout_day": "upper_a"}).json()["id"]
    client.post(f"/api/sessions/{sid}/sets", json={
        "exercise_id": "bench", "exercise_name": "Bench",
        "set_number": 1, "reps": 8, "weight_kg": 200})  # incomplete: must not count
    rows = client.get("/api/progress").json()
    bench = next(r for r in rows if r["exercise_id"] == "bench")
    assert bench["max_weight"] == 70


# --- CODE-7: PATCH on a missing session is a 404, not a 500 ---

def test_patch_missing_session_returns_404(client):
    r = client.patch("/api/sessions/99999", json={"completed": True})
    assert r.status_code == 404


# --- PI-9: HEAD /api/health works (uptime monitors) ---

def test_head_health_returns_200(client):
    assert client.head("/api/health").status_code == 200


# --- PI-7: export and health are never cacheable ---

def test_export_and_health_send_no_store(client):
    assert client.get("/api/export").headers.get("cache-control") == "no-store"
    assert client.get("/api/health").headers.get("cache-control") == "no-store"


# --- CODE-15: pre-import snapshots are pruned, newest 3 kept ---

def test_import_prunes_old_snapshots(client, mainmod):
    _completed_session(client, "bench", 60)
    envelope = client.get("/api/export").json()
    for _ in range(5):
        r = client.post("/api/import",
                        json={"mode": "replace", "confirm": True, "envelope": envelope})
        assert r.status_code == 200
    snaps = glob.glob(os.path.join(os.path.dirname(mainmod.DB_PATH), "pre-import-*.db"))
    assert len(snaps) == 3


# --- CODE-17: events batch cap, workout_day whitelist ---

def test_events_batch_over_100_rejected(client):
    batch = [{"name": "screen_view"}] * 101
    assert client.post("/api/events", json=batch).status_code == 422
    assert client.post("/api/events", json=batch[:100]).status_code == 204


def test_unknown_workout_day_rejected(client):
    assert client.post("/api/sessions", json={"workout_day": "yoga_day"}).status_code == 422
    assert client.post("/api/sessions", json={"workout_day": "upper_b"}).status_code == 200


# --- CODE-4 (partial): a stale "ok" heartbeat is surfaced as such ---

def test_health_reports_stale_when_last_backup_is_old(client, mainmod):
    with mainmod.db() as conn:
        conn.execute(
            "INSERT INTO events (name, ts) VALUES ('backup_completed', datetime('now','-30 hours'))")
        conn.commit()
    h = client.get("/api/health").json()
    assert h["last_backup_status"] == "stale"

def test_health_reports_ok_for_fresh_backup(client):
    client.post("/api/events", json=[{"name": "backup_completed"}])
    assert client.get("/api/health").json()["last_backup_status"] == "ok"
