"""scripts/deploy.sh refuses a schema-changing deploy without a backup from the last day.

The script runs for real in a scratch git repo. `ssh`, `ssh-add` and `docker` are
shims: ssh answers the health check and the backup-status read, and docker fails,
so a deploy that passes the guard stops at the build with "building" printed.
"""
import json
import os
import shutil
import stat
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

DEPLOY = Path(__file__).resolve().parent.parent / "scripts" / "deploy.sh"

SSH_SHIM = """#!/bin/sh
case "$*" in
  *api/health*) printf '{"status":"ok","version":"%s"}' "$LIVE_SHA" ;;
  *backup-status.json*) [ -f "$STATUS_FILE" ] && cat "$STATUS_FILE" || exit 1 ;;
esac
"""


def git(repo, *args):
    return subprocess.run(["git", "-C", str(repo), *args], check=True,
                          capture_output=True, text=True).stdout.strip()


@pytest.fixture
def deploy(tmp_path):
    shims = tmp_path / "shims"
    shims.mkdir()
    for name, body in (("ssh", SSH_SHIM), ("ssh-add", "#!/bin/sh\n"), ("docker", "#!/bin/sh\nexit 1\n")):
        p = shims / name
        p.write_text(body)
        p.chmod(p.stat().st_mode | stat.S_IEXEC)
    repo = tmp_path / "repo"
    (repo / "scripts").mkdir(parents=True)
    (repo / "backend").mkdir()
    shutil.copy(DEPLOY, repo / "scripts" / "deploy.sh")
    (repo / ".gitignore").write_text("AGENTS.local.md\n")
    (repo / "AGENTS.local.md").write_text(
        "## Scripted deploy configuration\nDEPLOY_HOST=host.test\nDEPLOY_APP_DIR=/app\n")
    git(repo, "init", "-q", "-b", "main")
    git(repo, "config", "user.email", "t@example.com")
    git(repo, "config", "user.name", "t")

    class Deploy:
        status_file = tmp_path / "status.json"
        repo_dir = repo

        def commit(self, schema):
            (repo / "backend" / "main.py").write_text(f"SCHEMA_VERSION = {schema}\n")
            git(repo, "add", "-A")
            git(repo, "commit", "-q", "-m", f"schema {schema}")
            return git(repo, "rev-parse", "--short", "HEAD")

        def backup(self, hours_ago):
            at = datetime.now(timezone.utc) - timedelta(hours=hours_ago)
            self.status_file.write_text(json.dumps(
                {"local": {"status": "ok", "at": at.strftime("%Y-%m-%dT%H:%M:%SZ")}}))

        def run(self, live_sha, **env):
            return subprocess.run(
                ["bash", str(repo / "scripts" / "deploy.sh")],
                env={**os.environ, "PATH": f"{shims}:{os.environ['PATH']}", "LIVE_SHA": live_sha,
                     "STATUS_FILE": str(self.status_file), **env},
                capture_output=True, text=True)

    return Deploy()


def test_schema_bump_with_an_old_backup_is_refused(deploy):
    live = deploy.commit(11)
    deploy.commit(12)
    deploy.backup(hours_ago=30)
    r = deploy.run(live)
    assert r.returncode == 1
    assert "last backup: 30h ago" in r.stdout
    assert "schema version" in r.stderr and "building" not in r.stdout


def test_schema_bump_without_a_status_file_is_refused(deploy):
    live = deploy.commit(11)
    deploy.commit(12)
    r = deploy.run(live)
    assert r.returncode == 1 and "last backup: unknown" in r.stdout


def test_schema_bump_with_a_fresh_backup_goes_on_to_build(deploy):
    live = deploy.commit(11)
    deploy.commit(12)
    deploy.backup(hours_ago=2)
    assert "building" in deploy.run(live).stdout


def test_the_override_lets_an_old_backup_through(deploy):
    live = deploy.commit(11)
    deploy.commit(12)
    deploy.backup(hours_ago=30)
    assert "building" in deploy.run(live, DEPLOY_ALLOW_OLD_BACKUP="1").stdout


def test_no_schema_change_never_needs_a_backup(deploy):
    live = deploy.commit(11)
    (deploy.repo_dir / "note.txt").write_text("x")
    git(deploy.repo_dir, "add", "-A")
    git(deploy.repo_dir, "commit", "-q", "-m", "docs")
    r = deploy.run(live)
    assert "last backup: unknown" in r.stdout and "building" in r.stdout
