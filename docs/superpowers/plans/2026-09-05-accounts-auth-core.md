# Accounts 1/4: schema v6 + auth core — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Issue:** #84 — step 1 of 4 in the accounts workstream (#85 Resend invite/reset → #86 gate flip →
#87 export/import roles). The chain is a hard dependency order, not a preference.

**Goal:** Add the schema and the server-side machinery for real logins — schema v6, bcrypt password
hashing, an `auth_sessions`-backed session with a `wt_session` cookie, a `current_profile`
dependency, and `POST /api/auth/login` / `POST /api/auth/logout` / `GET /api/auth/me` — **without
gating any data endpoint**.

**Architecture:** Schema v5 → v6 adds `profiles.email` (nullable, partial unique index), plus two
new tables, `auth_tokens` (minted in #85, created now) and `auth_sessions`. Sessions are
server-side rows, not signed stateless cookies, for one reason: a password reset in #85 must be
able to revoke every live session, which a self-contained token cannot do before it expires. All
new code lands in one delimited `# --- Auth ---` section of `backend/main.py` rather than a new
module — the app is deliberately a single backend module, and `Dockerfile:35` copies exactly
`backend/main.py`, so a split is a Dockerfile change plus a deploy risk this issue has no reason
to take. #85 can extract the section wholesale if it outgrows this.

**Tech Stack:** FastAPI + `sqlite3` (backend, Python 3.14), `bcrypt`, pytest.

**Spec:** `docs/superpowers/specs/2026-09-04-accounts-auth-design.md` — read it alongside this plan.
The owner decisions it records are settled; do not relitigate them.

## Global Constraints

- **TDD throughout.** Write the failing test, run it, watch it fail for the right reason, then
  implement. The repo has 88 backend + 210 frontend tests + a 12-test Playwright suite; all must
  stay green.
- **Do not apply the gate to data endpoints, and do not touch `_default_profile_id`.** That is #86.
  This step must be safe to deploy while the app is still open. Task 6 adds a regression test that
  fails if someone does it early.
- **`auth_tokens` and `auth_sessions` must NOT be added to `TABLES` or `TABLE_INTRODUCED_AT`.**
  They stay out of the export envelope: restoring a backup must never resurrect a live session or
  an unused invite, and a backup file must not be a store of credential material.
- **bcrypt cost 12.** Measured at 627 ms on the actual deploy target (Raspberry Pi 3 B+, aarch64).
  Do not raise it, and do not substitute argon2/scrypt, without re-measuring there — see the spec's
  "Why bcrypt cost 12" section for why a memory-hard KDF can OOM that box.
- **Password rules:** minimum 12 characters, maximum 72 **bytes** (bcrypt's own input limit — as of
  bcrypt 4.2 the library raises rather than silently truncating), no composition rules.
- **No frontend work.** Login/SetPassword pages and the route guard are #86.
- **No email, no tokens minted, no rate limiting.** Those are #85. This step only *creates* the
  `auth_tokens` table.
- Backend commands run from `backend/` with the named interpreter — nothing is on `PATH`:
  `.venv/bin/python -m pytest -q`. A fresh worktree has no `.venv`; create one with
  `python3.14 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt` (see `AGENTS.md`).
- **This adds the first new runtime dependency since the py3.14 bump.** CI never builds the
  Dockerfile, so a missing aarch64 wheel would show up only as a real build failure on the Pi.
  Task 6 builds the arm64 image by hand before the PR merges. This is not optional.

---

### Task 1: Schema v6 — `profiles.email`, `auth_tokens`, `auth_sessions`

**Files:**
- Modify: `backend/main.py:158-163` (end of `_migrate`, after the v4 → v5 block)
- Test: Create `backend/test_auth.py`

**Interfaces:**
- Produces: `PRAGMA user_version` = 6; `profiles.email TEXT` (nullable) with unique partial index
  `idx_profiles_email`; tables `auth_tokens(id, profile_id, token_hash, kind, expires_at, used_at,
  created_at)` and `auth_sessions(id, profile_id, expires_at, created_at)`.
- Consumes: nothing.

- [ ] **Step 1: Write the failing tests**

Create `backend/test_auth.py`:

```python
"""Accounts step 1 (#84): schema v6, password hashing, sessions, auth endpoints."""
import pytest


def _downgrade_to_v5(mainmod):
    """Undo v6 so the migration can be re-run against populated v5 data.

    The `mainmod` fixture's own init() already migrated the temp DB to v6
    before any test body runs, so resetting user_version alone is not enough —
    the v6 objects have to actually go away first. Same technique
    test_profiles.py uses for the rebuilt v4 tables.
    """
    with mainmod.db() as conn:
        conn.execute("DROP INDEX IF EXISTS idx_profiles_email")
        conn.execute("DROP TABLE IF EXISTS auth_tokens")
        conn.execute("DROP TABLE IF EXISTS auth_sessions")
        conn.execute("ALTER TABLE profiles DROP COLUMN email")
        conn.execute("PRAGMA user_version = 5")
        conn.commit()


def test_migration_v6_adds_email_column_and_auth_tables(mainmod):
    with mainmod.db() as conn:
        assert conn.execute("PRAGMA user_version").fetchone()[0] == 6
        cols = {r[1] for r in conn.execute("PRAGMA table_info(profiles)").fetchall()}
        assert cols == {"id", "username", "password_hash", "role", "created_at", "icon", "email"}
        tok = {r[1] for r in conn.execute("PRAGMA table_info(auth_tokens)").fetchall()}
        assert tok == {"id", "profile_id", "token_hash", "kind", "expires_at", "used_at", "created_at"}
        sess = {r[1] for r in conn.execute("PRAGMA table_info(auth_sessions)").fetchall()}
        assert sess == {"id", "profile_id", "expires_at", "created_at"}


def test_email_index_is_partial_so_many_profiles_may_stay_null(mainmod):
    with mainmod.db() as conn:
        conn.execute("INSERT INTO profiles (username, role) VALUES ('a', 'member')")
        conn.execute("INSERT INTO profiles (username, role) VALUES ('b', 'member')")
        conn.commit()  # two NULL emails must not collide
        assert conn.execute("SELECT COUNT(*) FROM profiles WHERE email IS NULL").fetchone()[0] == 3


def test_email_index_rejects_a_duplicate_non_null_address(mainmod):
    import sqlite3
    with mainmod.db() as conn:
        conn.execute("UPDATE profiles SET email = 'a@example.com' WHERE username = 'kapekost'")
        conn.execute("INSERT INTO profiles (username, role) VALUES ('other', 'member')")
        conn.commit()
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute("UPDATE profiles SET email = 'a@example.com' WHERE username = 'other'")


def test_auth_token_kind_is_constrained(mainmod):
    import sqlite3
    with mainmod.db() as conn:
        pid = conn.execute("SELECT id FROM profiles WHERE username = 'kapekost'").fetchone()[0]
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute("INSERT INTO auth_tokens (profile_id, token_hash, kind, expires_at) "
                         "VALUES (?, 'h', 'nonsense', datetime('now', '+1 day'))", (pid,))


def test_migration_v5_to_v6_preserves_a_populated_database(mainmod):
    _downgrade_to_v5(mainmod)
    with mainmod.db() as conn:
        pid = conn.execute("SELECT id FROM profiles WHERE username = 'kapekost'").fetchone()[0]
        conn.execute("INSERT INTO sessions (date, workout_day, profile_id) "
                     "VALUES ('2026-01-01', 'upper_a', ?)", (pid,))
        conn.execute("INSERT INTO sets (session_id, exercise_id, exercise_name, set_number, "
                     "reps, weight_kg, profile_id) VALUES (1,'bench_press','Bench Press',1,5,60,?)",
                     (pid,))
        conn.commit()
    mainmod.init()
    with mainmod.db() as conn:
        assert conn.execute("PRAGMA user_version").fetchone()[0] == 6
        assert conn.execute("SELECT COUNT(*) FROM sessions").fetchone()[0] == 1
        assert conn.execute("SELECT COUNT(*) FROM sets").fetchone()[0] == 1
        row = conn.execute("SELECT username, role, email FROM profiles WHERE id = ?", (pid,)).fetchone()
        assert row["username"] == "kapekost" and row["role"] == "admin" and row["email"] is None


def test_migration_v6_is_idempotent(mainmod):
    mainmod.init(); mainmod.init()
    with mainmod.db() as conn:
        assert conn.execute("PRAGMA user_version").fetchone()[0] == 6
        assert conn.execute("SELECT COUNT(*) FROM profiles").fetchone()[0] == 1


def test_auth_tables_stay_out_of_the_export_envelope(mainmod, client):
    assert "auth_tokens" not in mainmod.TABLES
    assert "auth_sessions" not in mainmod.TABLES
    assert "auth_tokens" not in mainmod.TABLE_INTRODUCED_AT
    assert "auth_sessions" not in mainmod.TABLE_INTRODUCED_AT
    env = client.get("/api/export").json()
    assert env["schema_version"] == 6
    assert set(env["tables"]) == set(mainmod.TABLES)


def test_a_v5_envelope_still_imports(client):
    env = {"schema_version": 5,
           "tables": {"profiles": [{"id": 1, "username": "kapekost", "role": "admin"}],
                      "sessions": [], "sets": [], "exercise_notes": [], "events": [],
                      "personal_bests": []}}
    r = client.post("/api/import", json={"envelope": env, "mode": "replace", "confirm": True})
    assert r.status_code == 200, r.text
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `.venv/bin/python -m pytest test_auth.py -v` from `backend/`
Expected: FAIL — `sqlite3.OperationalError: no such table: auth_tokens`, and the
`user_version == 6` assertions fail with `5`.

- [ ] **Step 3: Implement the v5 → v6 migration**

In `backend/main.py`, append to `_migrate` immediately after the `if v < 5:` block (which ends
`conn.execute("PRAGMA user_version = 5")`):

```python
    # --- v5 -> v6: accounts (#84) — email, invite/reset tokens, server-side sessions ---
    if v < 6:
        if not _column_exists(conn, "profiles", "email"):
            conn.execute("ALTER TABLE profiles ADD COLUMN email TEXT")
        # A partial unique index, not a UNIQUE column: several profiles may sit
        # at NULL email ("not yet invited") without colliding with each other.
        conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email "
                     "ON profiles(email) WHERE email IS NOT NULL")
        # auth_tokens is created here but not minted until #85 (invite/reset).
        # Only the SHA-256 of a token is ever stored, so a leaked database — or
        # a leaked backup — cannot be replayed into account access.
        conn.execute("""
            CREATE TABLE IF NOT EXISTS auth_tokens (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
                token_hash TEXT NOT NULL UNIQUE,
                kind       TEXT NOT NULL CHECK(kind IN ('invite', 'reset')),
                expires_at TEXT NOT NULL,
                used_at    TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_auth_tokens_profile ON auth_tokens(profile_id)")
        # Named auth_sessions to avoid colliding with the workout `sessions` table.
        # Neither this nor auth_tokens joins TABLES/TABLE_INTRODUCED_AT: restoring a
        # backup must not resurrect a live session or an unused invite, and a backup
        # should not be a store of credential material.
        conn.execute("""
            CREATE TABLE IF NOT EXISTS auth_sessions (
                id         TEXT PRIMARY KEY,
                profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_auth_sessions_profile ON auth_sessions(profile_id)")
        conn.execute("PRAGMA user_version = 6")
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `.venv/bin/python -m pytest test_auth.py -v` from `backend/`
Expected: PASS (8 tests).

- [ ] **Step 5: Run the whole backend suite**

Run: `.venv/bin/python -m pytest -q` from `backend/`
Expected: PASS — 88 existing + 8 new. If `test_profiles.py`'s
`test_migration_creates_profiles_table_with_seeded_admin` fails on the column set, add `"email"`
to its expected set with a comment naming #84, exactly as #69 did for `"icon"`.

- [ ] **Step 6: Commit**

```bash
git add backend/main.py backend/test_auth.py backend/test_profiles.py
git commit -m "feat(auth): schema v6 — profiles.email, auth_tokens, auth_sessions (#84)"
```

---

### Task 2: bcrypt dependency and password hashing helpers

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/main.py:1-8` (imports) and a new `# --- Auth ---` section placed immediately
  after `_last_backup()` and before the `# --- API Routes ---` comment
- Test: `backend/test_auth.py`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  - `BCRYPT_ROUNDS = 12` (module constant; tests monkeypatch it down for speed)
  - `PASSWORD_MIN_LEN = 12`, `PASSWORD_MAX_BYTES = 72`
  - `validate_password(password: str) -> None` — raises `ValueError` with a human-readable message
  - `hash_password(password: str) -> str` — validates, returns an ASCII bcrypt hash
  - `verify_password(password: str, password_hash: str | None) -> bool` — `False` for a `None` or
    malformed hash, never raises

- [ ] **Step 1: Write the failing tests**

Append to `backend/test_auth.py`:

```python
# --- password hashing ---

@pytest.fixture
def fast_bcrypt(mainmod, monkeypatch):
    """Cost 12 is ~0.6 s per hash on the deploy target and ~0.2 s here. The tests
    care about the helpers' behaviour, not the work factor, so drop the cost —
    test_bcrypt_cost_is_twelve below is what guards the real number."""
    monkeypatch.setattr(mainmod, "BCRYPT_ROUNDS", 4)
    return mainmod


def test_bcrypt_cost_is_twelve(mainmod):
    # Measured on the actual Pi at 627 ms. Do not raise without re-measuring
    # there — see docs/superpowers/specs/2026-09-04-accounts-auth-design.md.
    assert mainmod.BCRYPT_ROUNDS == 12


def test_hash_and_verify_round_trip(fast_bcrypt):
    h = fast_bcrypt.hash_password("correct horse battery")
    assert h.startswith("$2b$")
    assert fast_bcrypt.verify_password("correct horse battery", h) is True
    assert fast_bcrypt.verify_password("wrong horse battery", h) is False


def test_two_hashes_of_the_same_password_differ(fast_bcrypt):
    assert fast_bcrypt.hash_password("correct horse battery") != \
           fast_bcrypt.hash_password("correct horse battery")


def test_verify_rejects_a_null_hash(fast_bcrypt):
    # NULL password_hash means "invited but never set a password" — it must
    # never authenticate, and must never raise either.
    assert fast_bcrypt.verify_password("anything at all", None) is False
    assert fast_bcrypt.verify_password("anything at all", "") is False


def test_verify_rejects_a_malformed_hash_without_raising(fast_bcrypt):
    assert fast_bcrypt.verify_password("anything at all", "not-a-bcrypt-hash") is False


def test_password_shorter_than_twelve_is_rejected(fast_bcrypt):
    with pytest.raises(ValueError, match="at least 12"):
        fast_bcrypt.hash_password("short")


def test_password_longer_than_72_bytes_is_rejected_not_truncated(fast_bcrypt):
    with pytest.raises(ValueError, match="72 bytes"):
        fast_bcrypt.hash_password("a" * 73)


def test_password_length_is_measured_in_bytes_not_characters(fast_bcrypt):
    # 30 four-byte emoji = 120 bytes, which bcrypt would silently cut at 72.
    with pytest.raises(ValueError, match="72 bytes"):
        fast_bcrypt.hash_password("\U0001F4AA" * 30)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `.venv/bin/python -m pytest test_auth.py -k "password or bcrypt" -v` from `backend/`
Expected: FAIL with `AttributeError: module 'main' has no attribute 'BCRYPT_ROUNDS'`.

- [ ] **Step 3: Add the dependency**

In `backend/requirements.txt`, add after the existing pins:

```
bcrypt==5.0.0
```

Then install it into the worktree's venv:

```bash
.venv/bin/pip install -r requirements-dev.txt
```

- [ ] **Step 4: Implement the helpers**

In `backend/main.py`, change the imports at the top:

```python
from fastapi import FastAPI, HTTPException, Response, Request, Depends
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator
from typing import Literal, Optional
from contextlib import contextmanager
import sqlite3, os, json, glob, secrets
import bcrypt
from datetime import datetime, timezone
```

(`Request`, `Depends` and `secrets` are used in Tasks 3-5; adding them now keeps the import block
edited once.)

Then add a new section immediately after `_last_backup()` and before `# --- API Routes ---`:

```python
# --- Auth (#84) ---
# All of this is deliberately unwired from the data endpoints: #86 flips the
# gate and deletes _default_profile_id. Keeping it in one block means #85 can
# lift the whole section into its own module if it outgrows main.py — note that
# doing so also needs a Dockerfile change, since it COPYs backend/main.py by name.

# Cost 12 = 627 ms on the deploy target (Pi 3 B+, aarch64), measured, not
# assumed. bcrypt rather than a memory-hard KDF because each concurrent
# scrypt/argon2 hash reserves its full working set, and a handful of parallel
# logins could OOM a container on a box with ~185 MiB free running Home
# Assistant beside it. See the design doc before changing either fact.
BCRYPT_ROUNDS = 12
PASSWORD_MIN_LEN = 12
# bcrypt's own input limit. bcrypt >= 4.2 raises rather than silently
# truncating, but validating first turns that into a clear 400 instead of a 500.
PASSWORD_MAX_BYTES = 72

def validate_password(password: str) -> None:
    if len(password) < PASSWORD_MIN_LEN:
        raise ValueError(f"password must be at least {PASSWORD_MIN_LEN} characters")
    if len(password.encode("utf-8")) > PASSWORD_MAX_BYTES:
        raise ValueError(f"password must be at most {PASSWORD_MAX_BYTES} bytes")

def hash_password(password: str) -> str:
    validate_password(password)
    return bcrypt.hashpw(password.encode("utf-8"),
                         bcrypt.gensalt(rounds=BCRYPT_ROUNDS)).decode("ascii")

def verify_password(password: str, password_hash: str | None) -> bool:
    # A NULL hash means "invited, never set a password" and must never
    # authenticate. A malformed hash returns False rather than raising, so a
    # corrupt row is a failed login, not a 500 on the login path.
    if not password_hash:
        return False
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("ascii"))
    except ValueError:
        return False
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `.venv/bin/python -m pytest test_auth.py -v` from `backend/`
Expected: PASS (16 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/requirements.txt backend/main.py backend/test_auth.py
git commit -m "feat(auth): bcrypt cost-12 password hashing helpers (#84)"
```

---

### Task 3: Server-side session store, cookie helpers, `APP_COOKIE_SECURE`

**Files:**
- Modify: `backend/main.py` (`# --- Auth ---` section, after the password helpers)
- Modify: `AGENTS.local.md.example`
- Test: `backend/test_auth.py`

**Interfaces:**
- Consumes: `auth_sessions` (Task 1).
- Produces:
  - `SESSION_COOKIE = "wt_session"`, `SESSION_TTL_DAYS = 30`
  - `APP_COOKIE_SECURE: bool` — from the env var of the same name, `"1"` is on, default off
  - `issue_session(conn, profile_id: int) -> str` — inserts a row, returns the opaque id. Does not
    commit; the caller owns the transaction.
  - `session_profile(conn, session_id: str | None) -> sqlite3.Row | None` — the profile row
    (`id, username, role, icon, email`) for a live session, else `None`. Deletes the row on expiry.
  - `revoke_sessions(conn, profile_id: int) -> None` — deletes every session for a profile. Unused
    in #84; #85's password reset is its first caller, and it is tested here.
  - `set_session_cookie(response: Response, session_id: str) -> None`
  - `clear_session_cookie(response: Response) -> None`

All expiry arithmetic is done by SQLite (`datetime('now', '+30 days')`) so stored timestamps share
one format with every other `created_at` in the schema and string comparison is well-defined.

- [ ] **Step 1: Write the failing tests**

Append to `backend/test_auth.py`:

```python
# --- sessions ---

def _seed_id(mainmod):
    with mainmod.db() as conn:
        return conn.execute("SELECT id FROM profiles WHERE username = 'kapekost'").fetchone()[0]


def test_issue_session_stores_a_row_and_returns_an_opaque_id(mainmod):
    pid = _seed_id(mainmod)
    with mainmod.db() as conn:
        sid = mainmod.issue_session(conn, pid)
        conn.commit()
    assert isinstance(sid, str) and len(sid) >= 32
    with mainmod.db() as conn:
        row = conn.execute("SELECT profile_id, expires_at FROM auth_sessions WHERE id = ?",
                           (sid,)).fetchone()
        assert row["profile_id"] == pid
        # ~30 days out, generously bracketed so the assertion isn't clock-flaky
        assert conn.execute("SELECT ? > datetime('now', '+29 days') "
                            "AND ? < datetime('now', '+31 days')",
                            (row["expires_at"], row["expires_at"])).fetchone()[0] == 1


def test_session_ids_are_unique_per_issue(mainmod):
    pid = _seed_id(mainmod)
    with mainmod.db() as conn:
        a, b = mainmod.issue_session(conn, pid), mainmod.issue_session(conn, pid)
        conn.commit()
    assert a != b


def test_session_profile_returns_the_profile_for_a_live_session(mainmod):
    pid = _seed_id(mainmod)
    with mainmod.db() as conn:
        sid = mainmod.issue_session(conn, pid)
        conn.commit()
        row = mainmod.session_profile(conn, sid)
        assert row["id"] == pid and row["username"] == "kapekost" and row["role"] == "admin"
        assert "password_hash" not in row.keys()  # never hand the hash back out


def test_session_profile_rejects_unknown_and_empty_ids(mainmod):
    with mainmod.db() as conn:
        assert mainmod.session_profile(conn, "nope") is None
        assert mainmod.session_profile(conn, None) is None
        assert mainmod.session_profile(conn, "") is None


def test_expired_session_is_rejected_and_deleted_on_lookup(mainmod):
    pid = _seed_id(mainmod)
    with mainmod.db() as conn:
        conn.execute("INSERT INTO auth_sessions (id, profile_id, expires_at) "
                     "VALUES ('stale', ?, datetime('now', '-1 day'))", (pid,))
        conn.commit()
        assert mainmod.session_profile(conn, "stale") is None
    with mainmod.db() as conn:  # opportunistic cleanup, no reaper process
        assert conn.execute("SELECT COUNT(*) FROM auth_sessions WHERE id = 'stale'").fetchone()[0] == 0


def test_revoke_sessions_deletes_every_session_for_that_profile_only(mainmod):
    pid = _seed_id(mainmod)
    with mainmod.db() as conn:
        other = conn.execute("INSERT INTO profiles (username, role) VALUES ('other','member')").lastrowid
        mine_a, mine_b = mainmod.issue_session(conn, pid), mainmod.issue_session(conn, pid)
        theirs = mainmod.issue_session(conn, other)
        conn.commit()
        mainmod.revoke_sessions(conn, pid)
        conn.commit()
        assert mainmod.session_profile(conn, mine_a) is None
        assert mainmod.session_profile(conn, mine_b) is None
        assert mainmod.session_profile(conn, theirs) is not None


def test_deleting_a_profile_cascades_to_its_sessions(mainmod):
    with mainmod.db() as conn:
        other = conn.execute("INSERT INTO profiles (username, role) VALUES ('other','member')").lastrowid
        sid = mainmod.issue_session(conn, other)
        conn.commit()
        conn.execute("DELETE FROM profiles WHERE id = ?", (other,))
        conn.commit()
        assert conn.execute("SELECT COUNT(*) FROM auth_sessions WHERE id = ?", (sid,)).fetchone()[0] == 0


# --- cookie ---

def test_set_session_cookie_is_httponly_lax_and_thirty_days(mainmod):
    from fastapi import Response
    r = Response()
    mainmod.set_session_cookie(r, "abc123")
    header = r.headers["set-cookie"]
    assert "wt_session=abc123" in header
    assert "httponly" in header.lower()
    assert "samesite=lax" in header.lower()
    assert "Max-Age=2592000" in header
    assert "Path=/" in header


def test_cookie_is_not_secure_by_default(mainmod):
    from fastapi import Response
    r = Response()
    mainmod.set_session_cookie(r, "abc123")
    # The deploy target is plain HTTP on a tailnet today. Shipping Secure before
    # #27 terminates TLS would silently break login.
    assert "Secure" not in r.headers["set-cookie"]


def test_cookie_is_secure_when_app_cookie_secure_is_set(mainmod, monkeypatch):
    from fastapi import Response
    monkeypatch.setattr(mainmod, "APP_COOKIE_SECURE", True)
    r = Response()
    mainmod.set_session_cookie(r, "abc123")
    assert "Secure" in r.headers["set-cookie"]
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `.venv/bin/python -m pytest test_auth.py -k "session or cookie" -v` from `backend/`
Expected: FAIL with `AttributeError: module 'main' has no attribute 'issue_session'`.

- [ ] **Step 3: Implement the session store and cookie helpers**

Append to the `# --- Auth ---` section of `backend/main.py`:

```python
SESSION_COOKIE = "wt_session"
SESSION_TTL_DAYS = 30           # a phone-first app opened a few times a week
# Off for the current plain-HTTP tailnet URL; flipped to 1 once #27's tunnel
# terminates TLS. Shipping Secure before HTTPS exists silently breaks login.
APP_COOKIE_SECURE = os.environ.get("APP_COOKIE_SECURE", "0") == "1"

def issue_session(conn, profile_id: int) -> str:
    """Insert a session row and return its opaque id. Does not commit."""
    session_id = secrets.token_urlsafe(32)
    # Expiry is computed by SQLite so it shares one format with every other
    # timestamp in the schema and string comparison stays well-defined.
    conn.execute("INSERT INTO auth_sessions (id, profile_id, expires_at) "
                 f"VALUES (?, ?, datetime('now', '+{SESSION_TTL_DAYS} days'))",
                 (session_id, profile_id))
    return session_id

def session_profile(conn, session_id):
    """The profile behind a live session, or None. Expired rows are deleted on
    the way past — opportunistic cleanup, no reaper process."""
    if not session_id:
        return None
    row = conn.execute(
        "SELECT profile_id, expires_at <= datetime('now') AS expired "
        "FROM auth_sessions WHERE id = ?", (session_id,)).fetchone()
    if row is None:
        return None
    if row["expired"]:
        conn.execute("DELETE FROM auth_sessions WHERE id = ?", (session_id,))
        conn.commit()
        return None
    return conn.execute(
        "SELECT id, username, role, icon, email FROM profiles WHERE id = ?",
        (row["profile_id"],)).fetchone()

def revoke_sessions(conn, profile_id: int) -> None:
    """Kill every session for a profile. Does not commit.

    This is why sessions are server-side rows rather than a signed stateless
    cookie: #85's password reset must be able to end sessions that already
    exist, which a self-contained token cannot do before it expires.
    """
    conn.execute("DELETE FROM auth_sessions WHERE profile_id = ?", (profile_id,))

def set_session_cookie(response: Response, session_id: str) -> None:
    response.set_cookie(SESSION_COOKIE, session_id, max_age=SESSION_TTL_DAYS * 86400,
                        httponly=True, samesite="lax", secure=APP_COOKIE_SECURE, path="/")

def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/")
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `.venv/bin/python -m pytest test_auth.py -v` from `backend/`
Expected: PASS (26 tests).

- [ ] **Step 5: Document the new config value**

In `AGENTS.local.md.example`, under the `## Scripted deploy configuration` section's fenced block,
add a short subsection immediately before `## Gotchas and incident history`:

````markdown
## Application environment

Injected into the container as env vars (`docker run -e ...`). Placeholders only —
the real values live in your own untracked `AGENTS.local.md`.

```
APP_COOKIE_SECURE=0   # 1 once the app is served over HTTPS; 0 for plain-HTTP LAN/tailnet
```
````

Nothing secret goes in the tracked example file — see GUARDRAILS "Deployment knowledge stays
local". `APP_BASE_URL`, `RESEND_API_KEY` and `MAIL_FROM` are #85's, not this issue's.

- [ ] **Step 6: Commit**

```bash
git add backend/main.py backend/test_auth.py AGENTS.local.md.example
git commit -m "feat(auth): server-side sessions and the wt_session cookie (#84)"
```

---

### Task 4: `current_profile` dependency and `GET /api/auth/me`

**Files:**
- Modify: `backend/main.py` (`# --- Auth ---` section, then a new route beside `/api/profile/me`)
- Test: `backend/test_auth.py`

**Interfaces:**
- Consumes: `session_profile`, `SESSION_COOKIE` (Task 3).
- Produces:
  - `current_profile(request: Request) -> dict` — a FastAPI dependency returning
    `{id, username, role, icon, email}`; raises `HTTPException(401)` when there is no live session.
  - `GET /api/auth/me` → 200 with that dict, or 401.

- [ ] **Step 1: Write the failing tests**

Append to `backend/test_auth.py`:

```python
# --- current_profile / /api/auth/me ---

def test_auth_me_401s_without_a_cookie(client):
    r = client.get("/api/auth/me")
    assert r.status_code == 401


def test_auth_me_401s_on_an_unknown_cookie(client):
    r = client.get("/api/auth/me", cookies={"wt_session": "not-a-real-session"})
    assert r.status_code == 401


def test_auth_me_401s_on_an_expired_session(mainmod, client):
    pid = _seed_id(mainmod)
    with mainmod.db() as conn:
        conn.execute("INSERT INTO auth_sessions (id, profile_id, expires_at) "
                     "VALUES ('stale', ?, datetime('now', '-1 second'))", (pid,))
        conn.commit()
    assert client.get("/api/auth/me", cookies={"wt_session": "stale"}).status_code == 401


def test_auth_me_returns_the_profile_for_a_live_session(mainmod, client):
    pid = _seed_id(mainmod)
    with mainmod.db() as conn:
        sid = mainmod.issue_session(conn, pid)
        conn.commit()
    r = client.get("/api/auth/me", cookies={"wt_session": sid})
    assert r.status_code == 200
    assert r.json() == {"id": pid, "username": "kapekost", "role": "admin",
                        "icon": "\U0001F4AA", "email": None}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `.venv/bin/python -m pytest test_auth.py -k "auth_me" -v` from `backend/`
Expected: FAIL — 404, because `/api/auth/me` does not exist yet.

- [ ] **Step 3: Implement the dependency and the route**

Append to the `# --- Auth ---` section of `backend/main.py`:

```python
def current_profile(request: Request) -> dict:
    """Request-scoped identity, from the session cookie.

    Defined here but deliberately NOT applied to the data endpoints: #86 flips
    the gate across all of them and deletes _default_profile_id. Wiring it in
    early would close the app before the invite flow (#85) and the owner
    bootstrap exist, locking the owner out of their own history.
    """
    with db() as conn:
        row = session_profile(conn, request.cookies.get(SESSION_COOKIE))
    if row is None:
        raise HTTPException(401, "not authenticated")
    return dict(row)
```

Then add the route in the `# --- API Routes ---` section, directly above the existing
`@app.get("/api/profile/me")`:

```python
@app.get("/api/auth/me")
def auth_me(profile: dict = Depends(current_profile)):
    return profile
```

Leave `/api/profile/me` exactly as it is. It still answers from `_default_profile_id` and is what
the current frontend calls; #86 removes it in the same change that ships the login UI. Two
endpoints coexist for two issues on purpose — this one is the gated answer, that one is the open
shim.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `.venv/bin/python -m pytest test_auth.py -v` from `backend/`
Expected: PASS (30 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/main.py backend/test_auth.py
git commit -m "feat(auth): current_profile dependency and GET /api/auth/me (#84)"
```

---

### Task 5: `POST /api/auth/login`

**Files:**
- Modify: `backend/main.py` — a `LoginIn` model beside the other models, a `_dummy_hash()` helper in
  the `# --- Auth ---` section, and the route beside `/api/auth/me`
- Test: `backend/test_auth.py`

**Interfaces:**
- Consumes: `verify_password` (Task 2), `issue_session` / `set_session_cookie` (Task 3).
- Produces: `POST /api/auth/login` taking `{"username": str, "password": str}` → 200 with
  `{id, username, role, icon, email}` and a `Set-Cookie: wt_session=...`, or 401 with a single
  generic message.

**Note for the reviewer:** `_dummy_hash()` is a small addition beyond the Issue's literal wording.
Without it, a login for an unknown username returns without hashing anything and is trivially
distinguishable by response time from a wrong password for a real one. The spec takes that position
explicitly for `/api/auth/forgot-password` ("Same for timing — the handler does the same work either
way"); this applies the same rule to the endpoint #84 actually ships. It is six lines and easy to
drop if the reviewer disagrees.

- [ ] **Step 1: Write the failing tests**

Append to `backend/test_auth.py`:

```python
# --- login ---

@pytest.fixture
def member(fast_bcrypt):
    """A profile with a real password. There is no API to create one until #85."""
    with fast_bcrypt.db() as conn:
        pid = conn.execute(
            "INSERT INTO profiles (username, password_hash, role, icon) VALUES (?,?,?,?)",
            ("tester", fast_bcrypt.hash_password("correct horse battery"), "member", "\U0001F3CB")
        ).lastrowid
        conn.commit()
    return {"id": pid, "username": "tester", "password": "correct horse battery"}


def test_login_succeeds_and_sets_a_session_cookie(client, member):
    r = client.post("/api/auth/login",
                    json={"username": "tester", "password": "correct horse battery"})
    assert r.status_code == 200, r.text
    assert r.json() == {"id": member["id"], "username": "tester", "role": "member",
                        "icon": "\U0001F3CB", "email": None}
    assert "wt_session=" in r.headers["set-cookie"]
    assert "HttpOnly" in r.headers["set-cookie"]


def test_login_response_never_contains_the_password_hash(client, member):
    r = client.post("/api/auth/login",
                    json={"username": "tester", "password": "correct horse battery"})
    assert "password_hash" not in r.json()


def test_the_cookie_login_returns_is_usable_on_auth_me(client, member):
    login = client.post("/api/auth/login",
                        json={"username": "tester", "password": "correct horse battery"})
    assert login.status_code == 200
    me = client.get("/api/auth/me")  # TestClient keeps the cookie jar
    assert me.status_code == 200 and me.json()["username"] == "tester"


def test_login_with_the_wrong_password_401s_and_sets_no_cookie(client, member):
    r = client.post("/api/auth/login", json={"username": "tester", "password": "wrong horse battery"})
    assert r.status_code == 401
    assert "set-cookie" not in r.headers


def test_login_with_an_unknown_username_401s_with_the_same_message(client, member):
    unknown = client.post("/api/auth/login", json={"username": "nobody", "password": "correct horse battery"})
    wrong = client.post("/api/auth/login", json={"username": "tester", "password": "wrong horse battery"})
    assert unknown.status_code == wrong.status_code == 401
    assert unknown.json()["detail"] == wrong.json()["detail"]


def test_login_is_refused_for_a_profile_that_has_never_set_a_password(client):
    # The seeded kapekost profile has password_hash NULL — it must go through
    # #85's invite, not authenticate on an empty password.
    for attempt in ("", "anything at all", "correct horse battery"):
        r = client.post("/api/auth/login", json={"username": "kapekost", "password": attempt})
        assert r.status_code in (401, 422), attempt


def test_login_creates_exactly_one_session_row(mainmod, client, member):
    client.post("/api/auth/login", json={"username": "tester", "password": "correct horse battery"})
    with mainmod.db() as conn:
        assert conn.execute("SELECT COUNT(*) FROM auth_sessions WHERE profile_id = ?",
                            (member["id"],)).fetchone()[0] == 1


def test_a_failed_login_creates_no_session_row(mainmod, client, member):
    client.post("/api/auth/login", json={"username": "tester", "password": "wrong horse battery"})
    with mainmod.db() as conn:
        assert conn.execute("SELECT COUNT(*) FROM auth_sessions").fetchone()[0] == 0
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `.venv/bin/python -m pytest test_auth.py -k "login" -v` from `backend/`
Expected: FAIL — 404, because `/api/auth/login` does not exist yet.

- [ ] **Step 3: Add the request model**

In `backend/main.py`, add beside the other models (after `class NoteIn` is a good spot):

```python
class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    # Bounded so an over-long body can't be turned into free bcrypt work; the
    # real rules live in validate_password, which only runs when a password is
    # being *set* (#85), not checked.
    password: str = Field(min_length=1, max_length=256)
```

- [ ] **Step 4: Implement the dummy hash and the route**

Append to the `# --- Auth ---` section:

```python
_dummy_hash_cache: dict[int, str] = {}

def _dummy_hash() -> str:
    """A real hash at the live cost, so a login for an unknown username pays the
    same CPU as one for a real account and the two can't be told apart by
    timing. Cached per cost, so the first bogus login pays for it, not import
    time (which would tax every test-module reload)."""
    if BCRYPT_ROUNDS not in _dummy_hash_cache:
        _dummy_hash_cache[BCRYPT_ROUNDS] = bcrypt.hashpw(
            secrets.token_bytes(16), bcrypt.gensalt(rounds=BCRYPT_ROUNDS)).decode("ascii")
    return _dummy_hash_cache[BCRYPT_ROUNDS]
```

Then add the route directly above `@app.get("/api/auth/me")`:

```python
@app.post("/api/auth/login")
def login(body: LoginIn, response: Response):
    with db() as conn:
        row = conn.execute(
            "SELECT id, username, role, icon, email, password_hash FROM profiles WHERE username = ?",
            (body.username,)).fetchone()
        # One generic message for both "no such user" and "wrong password", and
        # the same bcrypt work either way.
        stored = row["password_hash"] if row is not None else None
        if not verify_password(body.password, stored or _dummy_hash()) or row is None or stored is None:
            raise HTTPException(401, "invalid username or password")
        session_id = issue_session(conn, row["id"])
        conn.commit()
    set_session_cookie(response, session_id)
    return {"id": row["id"], "username": row["username"], "role": row["role"],
            "icon": row["icon"], "email": row["email"]}
```

Note the condition order: `verify_password` always runs first so the CPU cost is paid on every
path, and the `row is None or stored is None` checks then reject the cases where the comparison was
against the dummy hash rather than a real credential.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `.venv/bin/python -m pytest test_auth.py -v` from `backend/`
Expected: PASS (38 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/main.py backend/test_auth.py
git commit -m "feat(auth): POST /api/auth/login issues a session cookie (#84)"
```

---

### Task 6: `POST /api/auth/logout`, the open-gate regression guard, and the arm64 build check

**Files:**
- Modify: `backend/main.py` (route beside the other auth routes)
- Test: `backend/test_auth.py`

**Interfaces:**
- Consumes: `SESSION_COOKIE`, `clear_session_cookie` (Task 3).
- Produces: `POST /api/auth/logout` → 204, deletes the session row and expires the cookie.
  Idempotent: 204 with no cookie, and 204 for an unknown one, so it never reveals whether a
  session was live.

- [ ] **Step 1: Write the failing tests**

Append to `backend/test_auth.py`:

```python
# --- logout ---

def test_logout_deletes_the_session_row_and_expires_the_cookie(mainmod, client, member):
    client.post("/api/auth/login", json={"username": "tester", "password": "correct horse battery"})
    r = client.post("/api/auth/logout")
    assert r.status_code == 204
    assert "wt_session=" in r.headers.get("set-cookie", "")
    assert "Max-Age=0" in r.headers["set-cookie"] or "expires=" in r.headers["set-cookie"].lower()
    with mainmod.db() as conn:
        assert conn.execute("SELECT COUNT(*) FROM auth_sessions").fetchone()[0] == 0
    assert client.get("/api/auth/me").status_code == 401


def test_logout_is_idempotent_and_reveals_nothing(client):
    assert client.post("/api/auth/logout").status_code == 204
    assert client.post("/api/auth/logout", cookies={"wt_session": "nope"}).status_code == 204


def test_logout_leaves_other_sessions_alone(mainmod, client, member):
    with mainmod.db() as conn:
        other = mainmod.issue_session(conn, member["id"])
        conn.commit()
    client.post("/api/auth/login", json={"username": "tester", "password": "correct horse battery"})
    client.post("/api/auth/logout")
    with mainmod.db() as conn:
        # Logout ends this device's session, not every session for the account —
        # that is revoke_sessions, and #85's password reset is what calls it.
        assert conn.execute("SELECT COUNT(*) FROM auth_sessions WHERE id = ?",
                            (other,)).fetchone()[0] == 1


# --- the gate is deliberately still open (#86 closes it) ---

@pytest.mark.parametrize("method,path", [
    ("get", "/api/sessions"),
    ("get", "/api/notes"),
    ("get", "/api/personal-bests"),
    ("get", "/api/progress"),
    ("get", "/api/exercises/recency"),
    ("get", "/api/analytics/summary"),
    ("get", "/api/export"),
    ("get", "/api/profile/me"),
    ("get", "/api/health"),
])
def test_data_endpoints_are_still_open_in_this_step(client, method, path):
    """#84 must be deployable while the app is still open — the invite flow
    (#85) and the owner bootstrap have to work before the gate closes, or the
    owner is locked out of their own history. #86 flips this test to expect 401
    (except /api/health, which stays open for the deploy smoke check)."""
    assert getattr(client, method)(path).status_code == 200
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `.venv/bin/python -m pytest test_auth.py -k "logout or still_open" -v` from `backend/`
Expected: the logout tests FAIL with 404; the open-gate tests PASS already (they are a guard
against a future regression, not a driver for new code — that is expected and fine).

- [ ] **Step 3: Implement logout**

Add the route in `backend/main.py` directly below `@app.post("/api/auth/login")`:

```python
@app.post("/api/auth/logout", status_code=204)
def logout(request: Request, response: Response):
    # 204 whether or not the cookie named a live session: logout must not be a
    # way to probe which session ids exist.
    session_id = request.cookies.get(SESSION_COOKIE)
    if session_id:
        with db() as conn:
            conn.execute("DELETE FROM auth_sessions WHERE id = ?", (session_id,))
            conn.commit()
    clear_session_cookie(response)
```

- [ ] **Step 4: Run the full backend suite**

Run: `.venv/bin/python -m pytest -q` from `backend/`
Expected: PASS — 88 existing + 50 new in `test_auth.py`.

- [ ] **Step 5: Verify the frontend suite is untouched**

Run from `frontend/`: `npm test`
Expected: PASS, 210 tests. No frontend file changed in this issue; this run exists to prove it.

- [ ] **Step 6: Build the arm64 image by hand**

This issue adds the first new runtime dependency since the py3.14 base-image bump, and
`Dockerfile:25-28` says why that matters: **CI never builds this Dockerfile**, so a missing
aarch64 wheel is invisible to every green check and shows up only as a failed build on the Pi.

```bash
docker buildx build --platform linux/arm64 -t wt-arm64-check .
```

Expected: the `pip install` layer resolves `bcrypt==5.0.0` from a wheel with **no compilation step**
in the log (`bcrypt` publishes `manylinux_2_17_aarch64` wheels for cp314). If pip falls back to
building from source, stop — the no-build-tools premise in the Dockerfile is broken and that is a
hard stop for the owner, not something to patch around by adding gcc.

- [ ] **Step 7: Commit**

```bash
git add backend/main.py backend/test_auth.py
git commit -m "feat(auth): POST /api/auth/logout, and a guard that the gate stays open (#84)"
```

---

## Review, PR and deploy

- [ ] **Code review** — `superpowers:requesting-code-review` (spec conformance + code quality). This
  changes auth/session/token handling, so also run `/security-review` before opening the PR; that is
  the class of change GUARDRAILS classifies as destructive.
- [ ] **PR** — `Closes #84`. Then `gh pr checks <PR> --watch --fail-fast`, confirm
  `gh pr view <PR> --json headRefOid,statusCheckRollup` shows the commit just pushed (a rollup right
  after a push can be stale), and merge with `gh pr merge <PR> --squash --delete-branch` only on a
  genuinely green result. Never `--auto`.
- [ ] **Deploy** — this is a schema migration, so per `AGENTS.md` an `/api/export` snapshot before
  deploying is mandatory, and a restore drill afterward. Confirm `PRAGMA user_version` reads 6 on
  the Pi and that `/api/health` still answers 200. `APP_COOKIE_SECURE` is left unset (defaults off)
  until #27 terminates TLS.
- [ ] **Write back** — comment on #84 with what shipped, and note on #85 that `auth_tokens` already
  exists, `validate_password`/`hash_password` are ready for its set-password endpoint, and
  `revoke_sessions` is the function its password reset must call.

## Self-review notes

Checked against the spec's sections and the Issue's scope list:

- **Schema v6** — Task 1, all three objects plus the partial-index rationale.
- **Password hashing** (cost 12, 72-byte cap, min 12, NULL means "cannot authenticate") — Task 2.
- **Sessions** (opaque 32-byte id, `wt_session`, HttpOnly/SameSite=Lax/30d, `APP_COOKIE_SECURE`,
  server-side so a reset can revoke, opportunistic expiry cleanup) — Task 3.
- **`current_profile`** — Task 4, defined and used only by `/api/auth/me`.
- **Login / logout / me** — Tasks 4-6.
- **Issue's named tests** — migration on a populated DB (Task 1), envelopes at schema ≤5 still
  import (Task 1), login success/failure (Task 5), session validate and revoke (Tasks 3, 6),
  expired session rejected (Tasks 3, 4).
- **Deliberately out of scope**, matching the Issue: the gate on data endpoints and
  `_default_profile_id` removal (#86, guarded by Task 6's test), token minting, Resend and rate
  limiting (#85), export/import roles (#87), all frontend work (#86).
