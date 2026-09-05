"""Accounts step 1 (#84): schema v6, password hashing, sessions, auth endpoints."""
import sqlite3
import pytest


def _downgrade_to_v5(mainmod):
    """Undo v6 so the migration can be re-run against populated v5 data.

    The `mainmod` fixture's own init() already migrated the temp DB to v6 before
    any test body runs, so resetting user_version alone is not enough — the v6
    objects have to actually go away first. Same technique test_profiles.py uses
    for the rebuilt v4 tables.
    """
    with mainmod.db() as conn:
        conn.execute("DROP INDEX IF EXISTS idx_profiles_email")
        conn.execute("DROP TABLE IF EXISTS auth_tokens")
        conn.execute("DROP TABLE IF EXISTS auth_sessions")
        conn.execute("ALTER TABLE profiles DROP COLUMN email")
        conn.execute("PRAGMA user_version = 5")
        conn.commit()


def _seed_id(mainmod):
    with mainmod.db() as conn:
        return conn.execute("SELECT id FROM profiles WHERE username = 'kapekost'").fetchone()[0]


def _as_session(client, session_id):
    """Put a session cookie on the client.

    Per-request `cookies=` is deprecated in starlette's TestClient (cookie
    persistence there is ambiguous), so set it on the instance instead.
    """
    client.cookies.set("wt_session", session_id)
    return client


# --- schema v6 ---

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
    with mainmod.db() as conn:
        conn.execute("UPDATE profiles SET email = 'a@example.com' WHERE username = 'kapekost'")
        conn.execute("INSERT INTO profiles (username, role) VALUES ('other', 'member')")
        conn.commit()
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute("UPDATE profiles SET email = 'a@example.com' WHERE username = 'other'")


def test_auth_token_kind_is_constrained(mainmod):
    with mainmod.db() as conn:
        pid = _seed_id(mainmod)
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute("INSERT INTO auth_tokens (profile_id, token_hash, kind, expires_at) "
                         "VALUES (?, 'h', 'nonsense', datetime('now', '+1 day'))", (pid,))


def test_migration_v5_to_v6_preserves_a_populated_database(mainmod):
    _downgrade_to_v5(mainmod)
    pid = _seed_id(mainmod)
    with mainmod.db() as conn:
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


# --- password hashing ---

@pytest.fixture
def fast_bcrypt(mainmod, monkeypatch):
    """Cost 12 is ~627 ms per hash on the deploy target and ~200 ms here. These
    tests care about the helpers' behaviour, not the work factor, so drop the
    cost — test_bcrypt_cost_is_twelve below is what guards the real number."""
    monkeypatch.setattr(mainmod, "BCRYPT_ROUNDS", 4)
    return mainmod


def test_bcrypt_cost_is_twelve(mainmod):
    # Measured on the actual Pi at 627 ms. Do not raise it, and do not swap in a
    # memory-hard KDF, without re-measuring there — see
    # docs/superpowers/specs/2026-09-04-accounts-auth-design.md.
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


def test_verify_rejects_a_non_ascii_hash_without_raising(fast_bcrypt):
    # A bcrypt hash is always ASCII, so this is a corrupt row — still a failed
    # login rather than a UnicodeEncodeError escaping onto the login path.
    assert fast_bcrypt.verify_password("anything at all", "n\u00f8t-ascii-💪") is False


def test_password_shorter_than_twelve_is_rejected(fast_bcrypt):
    with pytest.raises(ValueError, match="at least 12"):
        fast_bcrypt.hash_password("short")


def test_password_longer_than_72_bytes_is_rejected_not_truncated(fast_bcrypt):
    with pytest.raises(ValueError, match="72 bytes"):
        fast_bcrypt.hash_password("a" * 73)


def test_password_length_is_measured_in_bytes_not_characters(fast_bcrypt):
    # 30 four-byte emoji = 120 bytes, which bcrypt would otherwise cut at 72.
    with pytest.raises(ValueError, match="72 bytes"):
        fast_bcrypt.hash_password("\U0001F4AA" * 30)


# --- sessions ---

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
        # ~30 days out, bracketed generously so the assertion isn't clock-flaky
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
    assert "secure" not in r.headers["set-cookie"].lower()


def test_cookie_is_secure_when_app_cookie_secure_is_set(mainmod, monkeypatch):
    from fastapi import Response
    monkeypatch.setattr(mainmod, "APP_COOKIE_SECURE", True)
    r = Response()
    mainmod.set_session_cookie(r, "abc123")
    assert "secure" in r.headers["set-cookie"].lower()


# --- current_profile / GET /api/auth/me ---

def test_auth_me_401s_without_a_cookie(client):
    assert client.get("/api/auth/me").status_code == 401


def test_auth_me_401s_on_an_unknown_cookie(client):
    assert _as_session(client, "not-a-real-session").get("/api/auth/me").status_code == 401


def test_auth_me_401s_on_an_expired_session(mainmod, client):
    pid = _seed_id(mainmod)
    with mainmod.db() as conn:
        conn.execute("INSERT INTO auth_sessions (id, profile_id, expires_at) "
                     "VALUES ('stale', ?, datetime('now', '-1 second'))", (pid,))
        conn.commit()
    assert _as_session(client, "stale").get("/api/auth/me").status_code == 401


def test_auth_me_returns_the_profile_for_a_live_session(mainmod, client):
    pid = _seed_id(mainmod)
    with mainmod.db() as conn:
        sid = mainmod.issue_session(conn, pid)
        conn.commit()
    r = _as_session(client, sid).get("/api/auth/me")
    assert r.status_code == 200
    assert r.json() == {"id": pid, "username": "kapekost", "role": "admin",
                        "icon": "\U0001F4AA", "email": None}


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
    assert "httponly" in r.headers["set-cookie"].lower()


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
    unknown = client.post("/api/auth/login",
                          json={"username": "nobody", "password": "correct horse battery"})
    wrong = client.post("/api/auth/login",
                        json={"username": "tester", "password": "wrong horse battery"})
    assert unknown.status_code == wrong.status_code == 401
    assert unknown.json()["detail"] == wrong.json()["detail"]


def test_login_is_refused_for_a_profile_that_has_never_set_a_password(client):
    # The seeded kapekost profile has password_hash NULL — it must go through
    # #85's invite, not authenticate on an empty or guessed password.
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


# --- logout ---

def test_logout_deletes_the_session_row_and_expires_the_cookie(mainmod, client, member):
    client.post("/api/auth/login", json={"username": "tester", "password": "correct horse battery"})
    r = client.post("/api/auth/logout")
    assert r.status_code == 204
    header = r.headers.get("set-cookie", "")
    assert "wt_session=" in header
    assert "max-age=0" in header.lower() or "expires=" in header.lower()
    with mainmod.db() as conn:
        assert conn.execute("SELECT COUNT(*) FROM auth_sessions").fetchone()[0] == 0
    assert client.get("/api/auth/me").status_code == 401


def test_logout_is_idempotent_and_reveals_nothing(client):
    assert client.post("/api/auth/logout").status_code == 204
    assert _as_session(client, "nope").post("/api/auth/logout").status_code == 204


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

@pytest.mark.parametrize("path", [
    "/api/sessions",
    "/api/notes",
    "/api/personal-bests",
    "/api/progress",
    "/api/exercises/recency",
    "/api/analytics/summary",
    "/api/export",
    "/api/profile/me",
    "/api/health",
])
def test_data_endpoints_are_still_open_in_this_step(client, path):
    """#84 must be deployable while the app is still open — the invite flow
    (#85) and the owner bootstrap have to work before the gate closes, or the
    owner is locked out of their own history. #86 flips this to expect 401
    (except /api/health, which stays open for the deploy smoke check)."""
    assert client.get(path).status_code == 200
