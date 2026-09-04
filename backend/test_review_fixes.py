"""Tests for the 2026-07-09 review fixes (CODE-1/2/6/7/9/15/17, PI-7/9)."""
import os, json, glob, tempfile, importlib
from datetime import date, datetime, timedelta, timezone
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


# --- CODE-4 (partial): a stale "ok" backup is surfaced as such ---
# Since #88 the backup status arrives as data/backup-status.json written by
# scripts/backup.sh, not as an events row POSTed to /api/events.

def _write_backup_status(mainmod, body):
    path = os.path.join(os.path.dirname(mainmod.DB_PATH), "backup-status.json")
    with open(path, "w") as f:
        f.write(body if isinstance(body, str) else json.dumps(body))
    return path

def _ago(**delta):
    return (datetime.now(timezone.utc) - timedelta(**delta)).strftime("%Y-%m-%dT%H:%M:%SZ")

def test_health_reports_stale_when_last_backup_is_old(client, mainmod):
    _write_backup_status(mainmod, {"status": "ok", "at": _ago(days=9)})
    h = client.get("/api/health").json()
    assert h["last_backup_status"] == "stale"

def test_health_reports_ok_for_fresh_backup(client, mainmod):
    _write_backup_status(mainmod, {"status": "ok", "at": _ago(minutes=5)})
    assert client.get("/api/health").json()["last_backup_status"] == "ok"

def test_health_reports_ok_for_backup_older_than_a_day(client, mainmod):
    # The regression guard for #88. The cron is weekly now, so a 30h-old backup
    # is exactly on schedule; the old 26h threshold called this "stale". A
    # signal that is always red is one people stop reading, which is how three
    # nights of failed off-site backups went unnoticed on 2026-09-01..03.
    _write_backup_status(mainmod, {"status": "ok", "at": _ago(hours=30)})
    assert client.get("/api/health").json()["last_backup_status"] == "ok"

def test_health_keeps_failed_status_no_matter_how_old(client, mainmod):
    # A failure is already red. Ageing it into "stale" would only lose the one
    # detail that distinguishes the two: the chain ran and broke, rather than
    # never having run at all.
    _write_backup_status(mainmod, {"status": "failed", "at": _ago(days=30),
                                   "error": "backup.sh failed"})
    assert client.get("/api/health").json()["last_backup_status"] == "failed"


# --- review-of-review findings (2026-07-09 second pass) ---

def test_failed_imports_also_prune_snapshots(client, mainmod):
    _completed_session(client, "bench", 60)
    envelope = client.get("/api/export").json()
    bad = json_deepcopy(envelope)
    bad["tables"]["sessions"][0]["bogus_col"] = 1  # passes shape check, fails on insert
    for _ in range(5):
        r = client.post("/api/import",
                        json={"mode": "replace", "confirm": True, "envelope": bad})
        assert r.status_code == 400
    snaps = glob.glob(os.path.join(os.path.dirname(mainmod.DB_PATH), "pre-import-*.db"))
    assert len(snaps) <= 3


def json_deepcopy(obj):
    import json
    return json.loads(json.dumps(obj))


def test_health_survives_nonstandard_backup_ts(client, mainmod):
    _write_backup_status(mainmod, {"status": "ok", "at": "last Tuesday"})
    r = client.get("/api/health")
    assert r.status_code == 200  # unparseable ts must not 500 the monitoring endpoint
    # The status still stands; only the staleness comparison is skipped.
    assert r.json()["last_backup_status"] == "ok"

def test_health_survives_malformed_backup_status_file(client, mainmod):
    _write_backup_status(mainmod, "{ this is not json")  # e.g. a write cut short
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["last_backup_status"] == "none" and r.json()["last_backup_at"] is None


def test_all_progress_lists_only_exercises_with_completed_history(client):
    _completed_session(client, "bench", 60)
    sid = client.post("/api/sessions", json={"workout_day": "upper_a"}).json()["id"]
    client.post(f"/api/sessions/{sid}/sets", json={
        "exercise_id": "squat", "exercise_name": "Squat",
        "set_number": 1, "reps": 8, "weight_kg": 100})  # only in an incomplete session
    ids = [r["exercise_id"] for r in client.get("/api/progress").json()]
    assert "bench" in ids
    assert "squat" not in ids  # would be a picker chip with a permanently empty chart


# --- version stamp: /api/health reports the deployed commit ---

def test_health_reports_app_version(monkeypatch, tmp_path):
    monkeypatch.setenv("DATABASE_URL", str(tmp_path / "test.db"))
    monkeypatch.setenv("APP_COMMIT", "abc1234")
    import main
    importlib.reload(main)
    from fastapi.testclient import TestClient
    assert TestClient(main.app).get("/api/health").json()["version"] == "abc1234"


def test_health_version_defaults_to_dev(client):
    assert client.get("/api/health").json()["version"] == "dev"
