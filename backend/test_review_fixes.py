"""Tests for the 2026-07-09 review fixes (CODE-1/2/6/7/9/15/17, PI-7/9)."""
import os, glob, sqlite3, importlib
from datetime import date, datetime, timedelta, timezone
import pytest
from fastapi.testclient import TestClient

# mainmod/client used to be re-declared here; they are conftest's now, and
# conftest's `client` is logged in — which since #86 is the only kind that can
# reach a data endpoint at all.


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

def _ago(**delta):
    return (datetime.now(timezone.utc) - timedelta(**delta)).strftime("%Y-%m-%dT%H:%M:%SZ")

def test_backup_status_reports_stale_when_last_backup_is_old(client, write_backup_status):
    write_backup_status({"status": "ok", "at": _ago(days=9)})
    h = client.get("/api/admin/backup-status").json()
    assert h["last_backup_status"] == "stale"

def test_backup_status_reports_ok_for_fresh_backup(client, write_backup_status):
    write_backup_status({"status": "ok", "at": _ago(minutes=5)})
    assert client.get("/api/admin/backup-status").json()["last_backup_status"] == "ok"

def test_backup_status_reports_ok_for_backup_older_than_a_day(client, write_backup_status):
    # The regression guard for #88. The cron is weekly now, so a 30h-old backup
    # is exactly on schedule; the old 26h threshold called this "stale". A
    # signal that is always red is one people stop reading, which is how three
    # nights of failed off-site backups went unnoticed on 2026-09-01..03.
    write_backup_status({"status": "ok", "at": _ago(hours=30)})
    assert client.get("/api/admin/backup-status").json()["last_backup_status"] == "ok"

def test_backup_status_keeps_failed_status_no_matter_how_old(client, write_backup_status):
    # A failure is already red. Ageing it into "stale" would only lose the one
    # detail that distinguishes the two: the chain ran and broke, rather than
    # never having run at all.
    write_backup_status({"status": "failed", "at": _ago(days=30),
                         "error": "backup.sh failed"})
    assert client.get("/api/admin/backup-status").json()["last_backup_status"] == "failed"


# --- #93: the local and off-site legs are reported independently ---
# The old all-or-nothing chain reported `failed` for a Drive outage even though
# the local snapshot was sitting safely on the host's disk — four such nights
# in a row, 2026-09-01..04. `last_backup_status` stays the LOCAL leg: it is the
# one standing between us and data loss, and scripts/deploy.sh reads that key.

def test_backup_status_reports_both_legs_when_both_succeeded(client, write_backup_status):
    at = _ago(minutes=5)
    write_backup_status({"local": {"status": "ok", "at": at, "bytes": 172032,
                                   "duration_s": 12},
                         "remote": {"status": "ok", "at": at,
                                    "remote": "gdrive:workout-tracker-backups"}})
    h = client.get("/api/admin/backup-status").json()
    assert h["last_backup_status"] == "ok" and h["last_backup_at"] == at
    assert h["last_backup_remote_status"] == "ok" and h["last_backup_remote_at"] == at

def test_backup_status_reports_local_ok_when_only_the_off_site_leg_failed(client, write_backup_status):
    # The case #93 exists for: the snapshot is on disk, only the copy off the
    # box is missing. Calling that a failed backup is what taught us to stop
    # reading the signal.
    local_at, remote_at = _ago(minutes=5), _ago(minutes=4)
    write_backup_status({"local": {"status": "ok", "at": local_at, "bytes": 1024},
                         "remote": {"status": "failed", "at": remote_at,
                                    "error": "rclone copy failed"}})
    h = client.get("/api/admin/backup-status").json()
    assert h["last_backup_status"] == "ok" and h["last_backup_at"] == local_at
    assert h["last_backup_remote_status"] == "failed"
    assert h["last_backup_remote_at"] == remote_at

def test_backup_status_reports_the_remote_leg_as_skipped_when_the_local_one_failed(client, write_backup_status):
    # "We never tried" has to stay distinguishable from "we tried and it broke".
    at = _ago(minutes=5)
    write_backup_status({"local": {"status": "failed", "at": at,
                                   "error": "docker cp failed"},
                         "remote": {"status": "skipped", "at": at}})
    h = client.get("/api/admin/backup-status").json()
    assert h["last_backup_status"] == "failed"
    assert h["last_backup_remote_status"] == "skipped"

def test_an_old_local_leg_goes_stale_without_dragging_the_remote_with_it(client, write_backup_status):
    write_backup_status({"local": {"status": "ok", "at": _ago(days=9)},
                         "remote": {"status": "ok", "at": _ago(minutes=5)}})
    h = client.get("/api/admin/backup-status").json()
    assert h["last_backup_status"] == "stale"
    assert h["last_backup_remote_status"] == "ok"

def test_an_old_remote_leg_goes_stale_without_dragging_the_local_with_it(client, write_backup_status):
    write_backup_status({"local": {"status": "ok", "at": _ago(minutes=5)},
                         "remote": {"status": "ok", "at": _ago(days=9)}})
    h = client.get("/api/admin/backup-status").json()
    assert h["last_backup_status"] == "ok"
    assert h["last_backup_remote_status"] == "stale"

def test_a_skipped_remote_leg_never_ages_into_stale(client, write_backup_status):
    # Same reasoning as "failed": only an "ok" ages. Relabelling either would
    # drop the detail that says whether the leg ran at all.
    write_backup_status({"local": {"status": "failed", "at": _ago(days=30)},
                         "remote": {"status": "skipped", "at": _ago(days=30)}})
    h = client.get("/api/admin/backup-status").json()
    assert h["last_backup_status"] == "failed"
    assert h["last_backup_remote_status"] == "skipped"

def test_backup_status_still_reads_a_legacy_single_leg_status_file(client, write_backup_status):
    # The deploy-transition guard. The Pi is carrying a pre-#93 file right now,
    # written before this split existed, and /api/admin/backup-status has to keep reporting
    # it rather than going blank the moment the new image lands. Its top-level
    # "remote" is the remote's *name*, not a leg, and must not be read as one.
    at = _ago(minutes=5)
    write_backup_status({"status": "ok", "at": at, "bytes": 1024,
                         "remote": "gdrive:workout-tracker-backups",
                         "duration_s": 9})
    h = client.get("/api/admin/backup-status").json()
    assert h["last_backup_status"] == "ok" and h["last_backup_at"] == at
    assert h["last_backup_remote_status"] is None
    assert h["last_backup_remote_at"] is None

def test_backup_status_survives_an_unparseable_at_in_either_leg(client, write_backup_status):
    write_backup_status({"local": {"status": "ok", "at": "last Tuesday"},
                         "remote": {"status": "ok", "at": 1757030400}})
    r = client.get("/api/admin/backup-status")
    assert r.status_code == 200  # a bad timestamp must not 500 the monitoring endpoint
    # The local status still stands; only its staleness comparison is skipped.
    assert r.json()["last_backup_status"] == "ok"
    # A non-string "at" is not a leg we can report at all.
    assert r.json()["last_backup_remote_status"] is None

def test_backup_status_survives_legs_that_are_not_objects(client, write_backup_status):
    write_backup_status({"local": "ok", "remote": ["failed"]})
    r = client.get("/api/admin/backup-status")
    assert r.status_code == 200
    assert r.json()["last_backup_status"] == "none"
    assert r.json()["last_backup_remote_status"] is None


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


def test_backup_status_survives_nonstandard_backup_ts(client, write_backup_status):
    write_backup_status({"status": "ok", "at": "last Tuesday"})
    r = client.get("/api/admin/backup-status")
    assert r.status_code == 200  # unparseable ts must not 500 the monitoring endpoint
    # The status still stands; only the staleness comparison is skipped.
    assert r.json()["last_backup_status"] == "ok"

def test_health_fails_when_the_database_is_unopenable(mainmod, monkeypatch):
    # #88 moved the backup status out of the events table, which removed the
    # incidental DB read that used to make this endpoint fail on a broken
    # database. scripts/deploy.sh reads anything other than a 200 here as "the
    # deploy is not up", so the touch is deliberate now — and this is what
    # stops a later cleanup from quietly dropping it again.
    def unopenable():
        raise sqlite3.OperationalError("unable to open database file")
    monkeypatch.setattr(mainmod, "db", unopenable)
    client = TestClient(mainmod.app, raise_server_exceptions=False)
    assert client.get("/api/health").status_code == 500

def test_backup_status_survives_malformed_backup_status_file(client, write_backup_status):
    write_backup_status("{ this is not json")  # e.g. a write cut short
    r = client.get("/api/admin/backup-status")
    assert r.status_code == 200
    assert r.json()["last_backup_status"] == "none" and r.json()["last_backup_at"] is None
    assert r.json()["last_backup_remote_status"] is None
    assert r.json()["last_backup_remote_at"] is None


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
