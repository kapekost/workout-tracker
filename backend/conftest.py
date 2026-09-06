"""Shared fixtures — every test file used to re-declare these (5 copies)."""
import os, json, tempfile, importlib
import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def mainmod(monkeypatch):
    tmp = tempfile.mkdtemp()
    monkeypatch.setenv("DATABASE_URL", os.path.join(tmp, "test.db"))
    import main
    importlib.reload(main)  # re-run init() against the temp DB
    return main


@pytest.fixture
def seed_profile_id(mainmod):
    """The admin profile every fresh database is created with (see _migrate)."""
    with mainmod.db() as conn:
        return conn.execute("SELECT id FROM profiles WHERE username = 'kapekost'").fetchone()[0]


@pytest.fixture
def client(mainmod, seed_profile_id):
    """Logged in as the seeded owner — because since #86 an anonymous client
    cannot reach a single data endpoint, and almost every test in this suite is
    about what the data endpoints do rather than about being logged out.

    The session is a real auth_sessions row and a real cookie, so requests go
    through the same gate a browser does. It is inserted directly rather than
    obtained by logging in: a login costs a bcrypt verify (~200 ms here, 627 ms
    on the Pi) per test, and this fixture is used by nearly all of them.
    """
    c = TestClient(mainmod.app)
    with mainmod.db() as conn:
        c.cookies.set("wt_session", mainmod.issue_session(conn, seed_profile_id))
        conn.commit()
    return c


@pytest.fixture
def anon_client(mainmod):
    """No session cookie — for the tests that are *about* being logged out: the
    gate, login, and everything that must answer 401."""
    return TestClient(mainmod.app)


@pytest.fixture
def write_backup_status(mainmod):
    """Drop a backup-status.json where /api/admin/backup-status reads it.

    scripts/backup.sh writes this next to the DB, in the volume the app already
    mounts. Pass a dict for the normal cases, or raw text for a malformed file.
    """
    def _write(body):
        path = os.path.join(os.path.dirname(mainmod.DB_PATH), "backup-status.json")
        with open(path, "w") as f:
            f.write(body if isinstance(body, str) else json.dumps(body))
        return path
    return _write
