import os, tempfile, importlib
from datetime import datetime, timezone
import pytest
from fastapi.testclient import TestClient

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
        # schema v6 (#84: accounts — email, auth_tokens, auth_sessions) is the
        # app's current terminal version.
        assert conn.execute("PRAGMA user_version").fetchone()[0] == 6

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

def test_backup_status_reports_no_backup_then_ok(client, write_backup_status):
    h = client.get("/api/admin/backup-status").json()
    assert h["last_backup_at"] is None and h["last_backup_status"] == "none"
    # With no status file at all there is nothing to say about the off-site
    # leg either, and "nothing to say" is null rather than a made-up status.
    assert h["last_backup_remote_at"] is None and h["last_backup_remote_status"] is None

    at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    write_backup_status({"local": {"status": "ok", "at": at, "bytes": 1024},
                         "remote": {"status": "ok", "at": at,
                                    "remote": "gdrive:workout-tracker-backups"}})
    h = client.get("/api/admin/backup-status").json()
    assert h["last_backup_status"] == "ok" and h["last_backup_at"] == at
    assert h["last_backup_remote_status"] == "ok" and h["last_backup_remote_at"] == at

def test_export_envelope_shape(client):
    sid = client.post("/api/sessions", json={"workout_day": "upper_a"}).json()["id"]
    client.post(f"/api/sessions/{sid}/sets",
                json={"exercise_id": "bench_press", "exercise_name": "Bench",
                      "set_number": 1, "reps": 8, "weight_kg": 80})
    exp = client.get("/api/export").json()
    assert set(exp["tables"].keys()) == {"profiles", "sessions", "sets", "exercise_notes", "events", "personal_bests"}
    assert exp["schema_version"] == 6
    assert exp["exported_at"].endswith("Z")
    assert len(exp["tables"]["sessions"]) == 1 and len(exp["tables"]["sets"]) == 1

def _seed(client):
    sid = client.post("/api/sessions", json={"workout_day": "upper_a"}).json()["id"]
    client.post(f"/api/sessions/{sid}/sets",
                json={"exercise_id": "bench_press", "exercise_name": "Bench",
                      "set_number": 1, "reps": 8, "weight_kg": 80})
    return sid

def test_import_round_trip(client, reauthenticate):
    _seed(client)
    envelope = client.get("/api/export").json()
    # wipe by importing an empty-but-valid envelope? No — verify replace restores same data:
    r = client.post("/api/import", json={"mode": "replace", "confirm": True, "envelope": envelope})
    assert r.status_code == 200
    assert r.json()["restored"]["sessions"] == 1 and r.json()["restored"]["sets"] == 1
    again = reauthenticate(client).get("/api/export").json()
    assert again["tables"]["sessions"] == envelope["tables"]["sessions"]
    assert again["tables"]["sets"] == envelope["tables"]["sets"]

def test_import_requires_confirm(client):
    _seed(client)
    envelope = client.get("/api/export").json()
    assert client.post("/api/import", json={"mode": "replace", "confirm": False, "envelope": envelope}).status_code == 400
    # data untouched
    assert len(client.get("/api/export").json()["tables"]["sessions"]) == 1

def test_import_rejects_malformed_and_newer_schema(client):
    assert client.post("/api/import", json={"mode": "replace", "confirm": True, "envelope": {"nope": 1}}).status_code == 400
    bad = {"schema_version": 999, "tables": {t: [] for t in ["sessions","sets","exercise_notes","events"]}}
    assert client.post("/api/import", json={"mode": "replace", "confirm": True, "envelope": bad}).status_code == 400

def test_import_rejects_unknown_columns(client):
    _seed(client)
    envelope = client.get("/api/export").json()
    envelope["tables"]["sessions"][0]["bogus_col"] = 1
    r = client.post("/api/import", json={"mode": "replace", "confirm": True, "envelope": envelope})
    assert r.status_code == 400
    # existing data untouched, still exportable
    assert len(client.get("/api/export").json()["tables"]["sessions"]) == 1

def test_import_rejects_non_numeric_schema_version(client):
    _seed(client)
    bad = {"schema_version": "abc", "tables": {t: [] for t in ["sessions","sets","exercise_notes","events"]}}
    r = client.post("/api/import", json={"mode": "replace", "confirm": True, "envelope": bad})
    assert r.status_code == 400
    # seeded data untouched — the parse guard runs before snapshot/wipe
    assert len(client.get("/api/export").json()["tables"]["sessions"]) == 1

def test_import_reports_counts_from_actual_db_state(client, mainmod):
    # A future migration (e.g. profiles) will add a parent table processed
    # *after* a table that references it. Reproduce that shape now with the
    # FK relationship that already exists (sets -> sessions ON DELETE
    # CASCADE): if sets is restored before sessions, sessions' own DELETE
    # cascades and silently wipes the sets rows the loop just inserted.
    _seed(client)
    envelope = client.get("/api/export").json()
    mainmod.TABLES[:] = ["sets", "sessions", "exercise_notes", "events"]
    r = client.post("/api/import", json={"mode": "replace", "confirm": True, "envelope": envelope})
    assert r.status_code == 200
    with mainmod.db() as conn:
        actual_sets = conn.execute("SELECT COUNT(*) FROM sets").fetchone()[0]
    # The cascade left the DB with 0 sets rows even though the envelope had 1 —
    # the response must reflect what's actually in the DB.
    assert actual_sets == 0
    assert r.json()["restored"]["sets"] == actual_sets

def test_import_accepts_envelope_missing_tables_added_after_its_schema_version(client):
    # v1 predates the "events" table (added at v2, see _migrate). A genuine
    # v1 backup never had an "events" key at all — it must still import.
    old = {"schema_version": 1, "tables": {"sessions": [], "sets": [], "exercise_notes": []}}
    r = client.post("/api/import", json={"mode": "replace", "confirm": True, "envelope": old})
    assert r.status_code == 200
    assert client.get("/api/export").json()["tables"]["events"] == []

def test_import_still_rejects_current_envelope_missing_a_current_table(client):
    # A v2 envelope missing "events" is still malformed — the relaxation is
    # scoped to tables that postdate the envelope's own schema_version.
    current = {"schema_version": 2, "tables": {"sessions": [], "sets": [], "exercise_notes": []}}
    r = client.post("/api/import", json={"mode": "replace", "confirm": True, "envelope": current})
    assert r.status_code == 400

def test_import_of_older_envelope_does_not_roll_user_version_backward(client, mainmod):
    old = {"schema_version": 1, "tables": {"sessions": [], "sets": [], "exercise_notes": []}}
    r = client.post("/api/import", json={"mode": "replace", "confirm": True, "envelope": old})
    assert r.status_code == 200
    with mainmod.db() as conn:
        # schema v6 (#84: accounts) is the app's current terminal version.
        assert conn.execute("PRAGMA user_version").fetchone()[0] == 6
