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

def test_migrate_skips_realter_when_column_preexists(mainmod):
    # The mainmod fixture's reload already ran init() once, so sessions exists
    # and user_version is already 1. Rebuild the table to mimic the live-prod
    # shape: ended_at already present, user_version reset to 0 (never set).
    with mainmod.db() as conn:
        conn.executescript(
            "DROP TABLE IF EXISTS sessions;"
            "CREATE TABLE sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, "
            "date TEXT NOT NULL, workout_day TEXT NOT NULL, "
            "completed INTEGER DEFAULT 0, "
            "created_at TEXT DEFAULT (datetime('now')), ended_at TEXT);"
        )
        conn.execute("PRAGMA user_version = 0")
        conn.commit()
    mainmod.init()  # must not raise "duplicate column name: ended_at"
    with mainmod.db() as conn:
        assert conn.execute("PRAGMA user_version").fetchone()[0] == 2

def test_set_validation_rejects_bad_input(client):
    sid = client.post("/api/sessions", json={"workout_day": "upper_a"}).json()["id"]
    base = {"exercise_id": "bench_press", "exercise_name": "Bench", "set_number": 1}
    assert client.post(f"/api/sessions/{sid}/sets", json={**base, "reps": 0, "weight_kg": 80}).status_code == 422
    assert client.post(f"/api/sessions/{sid}/sets", json={**base, "reps": 8, "weight_kg": -5}).status_code == 422
    assert client.post(f"/api/sessions/{sid}/sets", json={**base, "reps": 8, "weight_kg": 5000}).status_code == 422
    assert client.post(f"/api/sessions/{sid}/sets", json={**base, "reps": 8, "weight_kg": 80}).status_code == 200

def test_session_validation_rejects_long_day(client):
    assert client.post("/api/sessions", json={"workout_day": "x" * 100}).status_code == 422

def test_events_ingest_and_summary(client):
    r = client.post("/api/events", json=[
        {"name": "screen_view", "screen": "Home"},
        {"name": "screen_view", "screen": "Workout"},
        {"name": "set_logged", "screen": "Workout", "props": {"reps": 8}},
    ])
    assert r.status_code == 204
    summ = client.get("/api/analytics/summary?days=30").json()
    names = {row["name"]: row["c"] for row in summ["by_name"]}
    screens = {row["screen"]: row["c"] for row in summ["by_screen"]}
    assert names["screen_view"] == 2 and names["set_logged"] == 1
    assert screens["Workout"] == 2 and screens["Home"] == 1

def test_events_rejects_malformed_batch(client):
    assert client.post("/api/events", json=[{"screen": "Home"}]).status_code == 422  # missing name

def test_analytics_summary_empty(client):
    summ = client.get("/api/analytics/summary").json()
    assert summ["by_name"] == [] and summ["by_screen"] == []
