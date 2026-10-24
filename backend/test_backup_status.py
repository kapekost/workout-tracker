"""Daily backup (#422): the skip-when-unchanged rule, keeping the newest 2
snapshots, and how /api/admin/backup-status reports a skipped run.

scripts/backup.sh is run for real against a throwaway database. `docker` and
`rclone` are replaced by two tiny shims that do the same work locally, so the
script's own logic (fingerprint, skip, prune, status file) is what is tested.
"""
import json
import os
import sqlite3
import stat
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "backup.sh"

DOCKER_SHIM = f"""#!{sys.executable}
import os, shutil, sys
a = sys.argv[1:]
if a[0] == "cp":
    src, dst = (x.split(":", 1)[1] if x.startswith("cid:") else x for x in a[1:3])
    if os.environ.get("CP_FAIL") and a[1].startswith("cid:"):  # snapshot copy only: a full disk: some bytes land, then it fails
        open(dst, "wb").write(b"x" * 100)
        sys.exit(1)
    shutil.copy(src, dst)
    sys.exit(0)
sub, rest = a[3], a[4:]  # docker compose -f FILE <sub> ...
if sub == "ps":
    print("cid")
    sys.exit(0)
cmd = rest[2:]  # exec -T workout-tracker <cmd>
if cmd[0] == "python":
    os.execv(sys.executable, [sys.executable] + cmd[1:])
os.execvp(cmd[0], cmd)
"""

RCLONE_SHIM = """#!/bin/sh
[ -n "$RCLONE_FAIL" ] && exit 1
mkdir -p "$3" && cp "$2" "$3/"
"""


@pytest.fixture
def host(tmp_path):
    shims = tmp_path / "shims"
    shims.mkdir()
    for name, body in (("docker", DOCKER_SHIM), ("rclone", RCLONE_SHIM)):
        p = shims / name
        p.write_text(body)
        p.chmod(p.stat().st_mode | stat.S_IEXEC)
    data = tmp_path / "data"
    data.mkdir()
    db = data / "workouts.db"
    con = sqlite3.connect(db)
    con.execute("CREATE TABLE sets (id INTEGER PRIMARY KEY, reps INTEGER)")
    con.execute("INSERT INTO sets (reps) VALUES (5)")
    con.commit()
    con.close()

    class Host:
        stage = tmp_path / "stage"
        remote = tmp_path / "remote"
        status_file = data / "backup-status.json"

        def change_db(self):
            c = sqlite3.connect(db)
            c.execute("INSERT INTO sets (reps) VALUES (8)")
            c.commit()
            c.close()

        def run(self, **extra_env):
            # Snapshot names carry a one-second timestamp; keep runs apart.
            time.sleep(1.1)
            env = {**os.environ, "EXTRA_PATH": str(shims), "DB": str(db),
                   "COMPOSE_FILE": "unused.yml", "STAGE": str(self.stage),
                   "REMOTE": str(self.remote), **extra_env}
            return subprocess.run(["bash", str(SCRIPT)], env=env,
                                  capture_output=True, text=True)

        def snapshots(self):
            return sorted(p.name for p in self.stage.glob("workout-*.db"))

        def status(self):
            return json.loads(self.status_file.read_text())

    return Host()


def test_first_run_snapshots_and_records_ok(host):
    r = host.run()
    assert r.returncode == 0, r.stderr
    assert len(host.snapshots()) == 1
    s = host.status()
    assert s["local"]["status"] == "ok" and s["remote"]["status"] == "ok"
    assert (host.remote / host.snapshots()[0]).exists()


def test_unchanged_database_is_skipped_not_snapshotted(host):
    host.run()
    first = host.snapshots()
    r = host.run()
    assert r.returncode == 0, r.stderr
    assert host.snapshots() == first
    assert host.status()["local"]["status"] == "skipped (unchanged)"


def test_changed_database_is_snapshotted_again(host):
    host.run()
    host.change_db()
    assert host.run().returncode == 0
    assert len(host.snapshots()) == 2
    assert host.status()["local"]["status"] == "ok"


def test_snapshot_is_a_full_consistent_copy(host):
    host.run()
    host.change_db()
    host.run()
    newest = sorted(host.stage.glob("workout-*.db"))[-1]
    con = sqlite3.connect(newest)
    assert con.execute("SELECT count(*) FROM sets").fetchone()[0] == 2
    assert con.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    con.close()


def test_only_the_newest_two_snapshots_are_kept(host):
    host.stage.mkdir()
    # A snapshot from the old manual days, in the old name format.
    (host.stage / "workout-20260904-120000.db").write_bytes(b"old")
    for _ in range(3):
        host.change_db()
        assert host.run().returncode == 0
    kept = host.snapshots()
    assert len(kept) == 2
    assert "workout-20260904-120000.db" not in kept


def test_a_skipped_run_still_retries_a_failed_offsite_leg(host):
    host.run()
    r = host.run(RCLONE_FAIL="1")
    assert r.returncode == 0  # off-site never fails the run
    s = host.status()
    assert s["local"]["status"] == "skipped (unchanged)"
    assert s["remote"]["status"] == "failed"
    host.run()
    assert host.status()["remote"]["status"] == "ok"


def test_a_failed_copy_leaves_no_snapshot_to_skip_against(host):
    r = host.run(CP_FAIL="1")
    assert r.returncode != 0
    assert host.status()["local"]["status"] == "failed"
    assert host.snapshots() == []
    assert list(host.stage.glob("workout-*")) == []
    r = host.run()  # the disk recovers: a real snapshot, not "unchanged"
    assert r.returncode == 0, r.stderr
    assert host.status()["local"]["status"] == "ok"
    assert len(host.snapshots()) == 1


def test_unreachable_database_records_failed(host, tmp_path):
    r = host.run(DB=str(tmp_path / "missing" / "workouts.db"))
    assert r.returncode != 0
    assert host.snapshots() == []


# --- how the app reports it ---

def _at(**delta):
    return (datetime.now(timezone.utc) - timedelta(**delta)).strftime("%Y-%m-%dT%H:%M:%SZ")


def _report(client):
    return client.get("/api/admin/backup-status").json()


def test_skipped_unchanged_is_reported_distinctly_from_failed(client, write_backup_status):
    write_backup_status({"local": {"status": "skipped (unchanged)", "at": _at(hours=3)}})
    assert _report(client)["last_backup_status"] == "skipped (unchanged)"
    write_backup_status({"local": {"status": "failed", "at": _at(hours=3)}})
    assert _report(client)["last_backup_status"] == "failed"


def test_stale_after_about_two_days(client, write_backup_status):
    for status in ("ok", "skipped (unchanged)"):
        write_backup_status({"local": {"status": status, "at": _at(hours=30)}})
        assert _report(client)["last_backup_status"] == status
        write_backup_status({"local": {"status": status, "at": _at(days=3)}})
        assert _report(client)["last_backup_status"] == "stale"


def test_failed_never_ages_into_stale(client, write_backup_status):
    write_backup_status({"local": {"status": "failed", "at": _at(days=30)}})
    assert _report(client)["last_backup_status"] == "failed"
