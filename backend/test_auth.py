"""Accounts step 1 (#84): schema v6, password hashing, sessions, auth endpoints."""
import re
import sqlite3
import pytest
from fastapi.testclient import TestClient


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

def test_auth_me_401s_without_a_cookie(anon_client):
    assert anon_client.get("/api/auth/me").status_code == 401


def test_auth_me_401s_on_an_unknown_cookie(anon_client):
    assert _as_session(anon_client, "not-a-real-session").get("/api/auth/me").status_code == 401


def test_auth_me_401s_on_an_expired_session(mainmod, anon_client):
    pid = _seed_id(mainmod)
    with mainmod.db() as conn:
        conn.execute("INSERT INTO auth_sessions (id, profile_id, expires_at) "
                     "VALUES ('stale', ?, datetime('now', '-1 second'))", (pid,))
        conn.commit()
    assert _as_session(anon_client, "stale").get("/api/auth/me").status_code == 401


def test_auth_me_returns_the_profile_for_a_live_session(mainmod, anon_client):
    pid = _seed_id(mainmod)
    with mainmod.db() as conn:
        sid = mainmod.issue_session(conn, pid)
        conn.commit()
    r = _as_session(anon_client, sid).get("/api/auth/me")
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


def test_login_succeeds_and_sets_a_session_cookie(anon_client, member):
    r = anon_client.post("/api/auth/login",
                         json={"username": "tester", "password": "correct horse battery"})
    assert r.status_code == 200, r.text
    assert r.json() == {"id": member["id"], "username": "tester", "role": "member",
                        "icon": "\U0001F3CB", "email": None}
    assert "wt_session=" in r.headers["set-cookie"]
    assert "httponly" in r.headers["set-cookie"].lower()


def test_login_response_never_contains_the_password_hash(anon_client, member):
    r = anon_client.post("/api/auth/login",
                         json={"username": "tester", "password": "correct horse battery"})
    assert "password_hash" not in r.json()


def test_the_cookie_login_returns_is_usable_on_auth_me(anon_client, member):
    login = anon_client.post("/api/auth/login",
                             json={"username": "tester", "password": "correct horse battery"})
    assert login.status_code == 200
    me = anon_client.get("/api/auth/me")  # TestClient keeps the cookie jar
    assert me.status_code == 200 and me.json()["username"] == "tester"


def test_login_with_the_wrong_password_401s_and_sets_no_cookie(anon_client, member):
    r = anon_client.post("/api/auth/login", json={"username": "tester", "password": "wrong horse battery"})
    assert r.status_code == 401
    assert "set-cookie" not in r.headers


def test_login_with_an_unknown_username_401s_with_the_same_message(anon_client, member):
    unknown = anon_client.post("/api/auth/login",
                               json={"username": "nobody", "password": "correct horse battery"})
    wrong = anon_client.post("/api/auth/login",
                             json={"username": "tester", "password": "wrong horse battery"})
    assert unknown.status_code == wrong.status_code == 401
    assert unknown.json()["detail"] == wrong.json()["detail"]


def test_login_is_refused_for_a_profile_that_has_never_set_a_password(anon_client):
    # The seeded kapekost profile has password_hash NULL — it must go through
    # #85's invite, not authenticate on an empty or guessed password.
    for attempt in ("", "anything at all", "correct horse battery"):
        r = anon_client.post("/api/auth/login", json={"username": "kapekost", "password": attempt})
        assert r.status_code in (401, 422), attempt


def test_login_creates_exactly_one_session_row(mainmod, anon_client, member):
    anon_client.post("/api/auth/login", json={"username": "tester", "password": "correct horse battery"})
    with mainmod.db() as conn:
        assert conn.execute("SELECT COUNT(*) FROM auth_sessions WHERE profile_id = ?",
                            (member["id"],)).fetchone()[0] == 1


def test_a_failed_login_creates_no_session_row(mainmod, anon_client, member):
    anon_client.post("/api/auth/login", json={"username": "tester", "password": "wrong horse battery"})
    with mainmod.db() as conn:
        assert conn.execute("SELECT COUNT(*) FROM auth_sessions").fetchone()[0] == 0


# --- logout ---

def test_logout_deletes_the_session_row_and_expires_the_cookie(mainmod, anon_client, member):
    anon_client.post("/api/auth/login", json={"username": "tester", "password": "correct horse battery"})
    r = anon_client.post("/api/auth/logout")
    assert r.status_code == 204
    header = r.headers.get("set-cookie", "")
    assert "wt_session=" in header
    assert "max-age=0" in header.lower() or "expires=" in header.lower()
    with mainmod.db() as conn:
        assert conn.execute("SELECT COUNT(*) FROM auth_sessions").fetchone()[0] == 0
    assert anon_client.get("/api/auth/me").status_code == 401


def test_logout_is_idempotent_and_reveals_nothing(anon_client):
    assert anon_client.post("/api/auth/logout").status_code == 204
    assert _as_session(anon_client, "nope").post("/api/auth/logout").status_code == 204


def test_logout_leaves_other_sessions_alone(mainmod, anon_client, member):
    with mainmod.db() as conn:
        other = mainmod.issue_session(conn, member["id"])
        conn.commit()
    anon_client.post("/api/auth/login", json={"username": "tester", "password": "correct horse battery"})
    anon_client.post("/api/auth/logout")
    with mainmod.db() as conn:
        # Logout ends this device's session, not every session for the account —
        # that is revoke_sessions, and #85's password reset is what calls it.
        assert conn.execute("SELECT COUNT(*) FROM auth_sessions WHERE id = ?",
                            (other,)).fetchone()[0] == 1


# --- the gate is closed (#86) ---
# This was test_data_endpoints_are_still_open_in_this_step through #84 and
# #110, asserting 200 for every one of these. #86 is the flip it was written
# for; the table shape is the point, so it stayed.

# The only paths that may answer without a session, and why. Everything else
# the app routes under /api/ must 401 — including a route added tomorrow, which
# is why the completeness check below reads app.routes rather than trusting a
# hand-maintained list to have kept up.
OPEN = {
    ("GET", "/api/health"): "scripts/deploy.sh's smoke check; there is no session at deploy time",
    ("HEAD", "/api/health"): "same check, and what an uptime monitor uses",
    ("POST", "/api/auth/login"): "how a session is obtained in the first place",
    ("POST", "/api/auth/logout"): "204 either way; must not become a way to probe session ids",
    ("POST", "/api/auth/set-password"): "the invite/reset link is the credential, not a cookie",
    ("POST", "/api/auth/forgot-password"): "reached by someone who cannot log in, by definition",
}

# Every gated route, with a body where the method needs one. The bodies are
# valid on purpose: a 401 that only happened because the payload was rubbish
# would prove nothing about the gate.
_SET = {"exercise_id": "bench_press", "exercise_name": "Bench Press",
        "set_number": 1, "reps": 5, "weight_kg": 60}
GATED = [
    ("GET",    "/api/profile/me", None),
    ("GET",    "/api/auth/me", None),
    ("POST",   "/api/profiles", {"username": "newbie", "email": "n@example.com"}),
    ("GET",    "/api/admin/backup-status", None),
    ("POST",   "/api/sessions", {"workout_day": "upper_a"}),
    ("GET",    "/api/sessions", None),
    ("GET",    "/api/sessions/{sid}", None),
    ("PATCH",  "/api/sessions/{sid}", {"completed": True}),
    ("DELETE", "/api/sessions/{sid}", None),
    ("POST",   "/api/sessions/{sid}/sets", _SET),
    ("DELETE", "/api/sessions/{sid}/sets/{set_id}", None),
    ("GET",    "/api/sessions/{sid}/prs", None),
    ("POST",   "/api/personal-bests", {"exercise_id": "bench_press", "exercise_name": "Bench Press",
                                       "weight_kg": 100, "reps": 3, "achieved_year": 2024}),
    ("GET",    "/api/personal-bests", None),
    ("DELETE", "/api/personal-bests/{pb_id}", None),
    ("GET",    "/api/progress/{exercise_id}", None),
    ("GET",    "/api/progress", None),
    ("GET",    "/api/notes", None),
    ("PUT",    "/api/exercises/{exercise_id}/note", {"note": "elbows in"}),
    ("GET",    "/api/exercises/{exercise_id}/last", None),
    ("GET",    "/api/exercises/recency", None),
    ("POST",   "/api/events", [{"name": "screen_view", "screen": "Home"}]),
    ("GET",    "/api/analytics/summary", None),
    ("GET",    "/api/export", None),
    ("POST",   "/api/import", {"mode": "replace", "confirm": True,
                               "envelope": {"schema_version": 6, "tables": {}}}),
]


def _api_routes(mainmod):
    """(method, path) for everything the app serves under /api/.

    Anything it cannot see into is an error rather than a shrug. A `Mount` has
    no `.methods`, so the old `getattr(route, "methods", set())` yielded nothing
    for one — `app.mount("/api/sub", subapp)` would have served every route
    inside it anonymously while this suite stayed green. Same for HEAD, which
    used to be subtracted unconditionally: a HEAD-only route answered without a
    session and the table never noticed. Only OPTIONS is dropped, and it is
    dropped because nothing declares one (there is no CORS middleware).
    """
    for route in mainmod.app.routes:
        path = getattr(route, "path", "")
        if not path.startswith("/api/"):
            continue
        methods = getattr(route, "methods", None)
        assert methods, f"{path} is a mount; the gate table cannot see inside it"
        for method in methods - {"OPTIONS"}:
            yield method, path


def _fill(path):
    return re.sub(r"\{[^}]+\}", "1", path)


def test_the_gate_table_lists_every_route_the_app_actually_has(mainmod):
    """The table above is only a guarantee if it is complete.

    A route added later without a gate has to fail this suite rather than ship
    open, and a list maintained by hand cannot promise that. So the routes come
    from the app itself: anything under /api/ is expected to be gated unless it
    is in OPEN, which is a deliberate, commented decision each time.
    """
    declared = {(m, p) for m, p, _ in GATED}
    assert not (declared & set(OPEN)), "a route cannot be both gated and open"
    routes = set(_api_routes(mainmod))
    missing = routes - declared - set(OPEN)
    assert not missing, (
        f"these routes are neither gated below nor deliberately open: {sorted(missing)}")
    gone = (declared | set(OPEN)) - routes
    assert not gone, f"these no longer exist and should leave the table: {sorted(gone)}"


@pytest.mark.parametrize("method,path,body", GATED, ids=[f"{m} {p}" for m, p, _ in GATED])
def test_every_data_endpoint_401s_without_a_session(anon_client, method, path, body):
    """The gate, from the outside: no cookie, no data — reads and writes alike,
    and before the endpoint does any of the work it would otherwise do."""
    r = anon_client.request(method, _fill(path), json=body)
    assert r.status_code == 401, f"{method} {path} answered {r.status_code}: {r.text[:200]}"
    assert r.json() == {"detail": "not authenticated"}


def test_the_gate_answers_before_validation_does(anon_client):
    """A rubbish body or an unparseable path parameter must still be a 401, not
    a 422. Otherwise the shape of every request the app accepts is readable
    without a session, and "is this id valid" becomes answerable by anyone."""
    assert anon_client.post("/api/sessions", json={"workout_day": "yoga"}).status_code == 401
    assert anon_client.post("/api/events", json={"not": "a list"}).status_code == 401
    assert anon_client.post("/api/events").status_code == 401
    assert anon_client.get("/api/sessions/not-an-int").status_code == 401


@pytest.mark.parametrize("method,path", sorted(OPEN), ids=[f"{m} {p}" for m, p in sorted(OPEN)])
def test_the_open_paths_stay_open(anon_client, method, path):
    # Not asserting one status — login with no body is a 422, logout a 204 —
    # only that none of them is the gate answering.
    assert anon_client.request(method, path).status_code != 401


def test_the_api_publishes_no_schema_of_itself(anon_client):
    """The interactive docs and the OpenAPI document are off, not gated.

    current_profile's 401 landing before validation means the shape of a
    request cannot be read back through the endpoints — which was worth nothing
    while FastAPI's defaults handed the same shapes, `LoginIn` and
    `SetPasswordIn` included, to anyone who asked for /openapi.json.

    404 here because the tests run with no `static` directory; in the image the
    SPA mount answers an unknown non-/api/ path with the app shell instead.
    Either way, nothing serves a schema.
    """
    for path in ("/openapi.json", "/docs", "/redoc"):
        assert anon_client.get(path).status_code == 404, f"{path} is still served"


def test_health_keeps_answering_the_deploy_smoke_check(anon_client):
    """scripts/deploy.sh curls this from the host, with no session and no way to
    get one, and reads `version` to prove the deploy landed. It is also the only
    /api/ path an anonymous caller can read, so it now says nothing else: the
    backup posture moved to /api/admin/backup-status (#86)."""
    r = anon_client.get("/api/health")
    assert r.status_code == 200
    assert set(r.json()) == {"status", "version"}
    assert r.json()["status"] == "ok"


def test_the_backup_posture_is_admin_only(mainmod, anon_client, client, write_backup_status):
    """Where the four last_backup_* keys went. A publicly reachable endpoint
    should not publish how long it has been since the database was last copied
    off the box, or whether that copy failed — and after #27 puts this behind a
    tunnel, /api/health is public in earnest."""
    write_backup_status({"local": {"status": "ok", "at": "2026-09-05T00:12:03Z"}})
    assert anon_client.get("/api/admin/backup-status").status_code == 401
    with mainmod.db() as conn:
        pid = conn.execute("INSERT INTO profiles (username, role) VALUES ('plain','member')").lastrowid
        member_session = mainmod.issue_session(conn, pid)
        conn.commit()
    assert _as_session(anon_client, member_session).get(
        "/api/admin/backup-status").status_code == 403
    # `client` is the seeded owner, whose role is admin.
    r = client.get("/api/admin/backup-status")
    assert r.status_code == 200
    assert set(r.json()) == {"last_backup_at", "last_backup_status",
                             "last_backup_remote_at", "last_backup_remote_status"}
    assert r.json()["last_backup_status"] == "ok"


# --- the owner is never locked out of, or shown an empty, app (#86) ---
# The risk this step carries: a gate plus read-scoping is two separate ways to
# hand the owner a working login and none of their own history. Both tests
# assert seeded counts rather than "not empty", so a scoping bug that returns
# some of the rows fails here too.

def _seed_owner_history(mainmod, profile_id):
    """Rows attributed to `profile_id` the way the v4 migration left the owner's
    pre-accounts data: written straight to the tables with profile_id
    backfilled, never through the API. Returns the counts to assert against."""
    with mainmod.db() as conn:
        for day in ("upper_a", "lower_a", "upper_b"):
            sid = conn.execute(
                "INSERT INTO sessions (date, workout_day, completed, profile_id) "
                "VALUES ('2026-01-01', ?, 1, ?)", (day, profile_id)).lastrowid
            for n in (1, 2):
                conn.execute(
                    "INSERT INTO sets (session_id, exercise_id, exercise_name, set_number, "
                    "reps, weight_kg, profile_id) VALUES (?,?,?,?,?,?,?)",
                    (sid, f"ex_{day}", day, n, 5, 60 + n, profile_id))
        for ex in ("ex_upper_a", "ex_lower_a"):
            conn.execute("INSERT INTO exercise_notes (profile_id, exercise_id, note) "
                         "VALUES (?,?,'keep the elbows in')", (profile_id, ex))
        conn.execute("INSERT INTO personal_bests (exercise_id, exercise_name, weight_kg, "
                     "reps, achieved_year, profile_id) VALUES ('ex_upper_a','upper_a',120,3,2024,?)",
                     (profile_id,))
        conn.execute("INSERT INTO events (name, screen, profile_id) VALUES ('screen_view','Home',?)",
                     (profile_id,))
        conn.commit()
    return {"sessions": 3, "sets": 6, "notes": 2, "personal_bests": 1, "exercises": 3}


def test_the_logged_in_owner_sees_all_of_their_own_rows(mainmod, client):
    counts = _seed_owner_history(mainmod, _seed_id(mainmod))
    sessions = client.get("/api/sessions").json()
    assert len(sessions) == counts["sessions"]
    assert sum(len(client.get(f"/api/sessions/{s['id']}").json()["sets"])
               for s in sessions) == counts["sets"]
    assert len(client.get("/api/notes").json()) == counts["notes"]
    assert len(client.get("/api/personal-bests").json()) == counts["personal_bests"]
    assert len(client.get("/api/progress").json()) == counts["exercises"]
    assert len(client.get("/api/exercises/recency").json()) == counts["exercises"]
    assert len(client.get("/api/progress/ex_upper_a").json()) == 1
    assert client.get("/api/exercises/ex_upper_a/last").json() is not None
    assert client.get("/api/analytics/summary").json()["by_name"] == [{"name": "screen_view", "c": 1}]
    assert len(client.get("/api/export").json()["tables"]["sessions"]) == counts["sessions"]


def test_no_state_leaves_a_logged_in_owner_with_an_empty_app(mainmod, client, fast_bcrypt):
    """Every way the owner's identity gets re-established must land on the same
    profile, and therefore the same rows. A gate that authenticates but resolves
    to some *other* profile id looks exactly like a working login onto an empty
    account — the failure worth being paranoid about, because the owner's
    reaction to it is to assume the data is gone."""
    pid = _seed_id(mainmod)
    counts = _seed_owner_history(mainmod, pid)
    with mainmod.db() as conn:
        conn.execute("UPDATE profiles SET password_hash = ? WHERE id = ?",
                     (mainmod.hash_password("correct horse battery"), pid))
        conn.commit()

    def owner_sees_everything(c):
        assert len(c.get("/api/sessions").json()) == counts["sessions"]
        assert len(c.get("/api/personal-bests").json()) == counts["personal_bests"]
        assert len(c.get("/api/notes").json()) == counts["notes"]
        assert len(c.get("/api/progress").json()) == counts["exercises"]
        assert c.get("/api/profile/me").json()["id"] == pid

    owner_sees_everything(client)                        # the session the fixture issued
    client.post("/api/auth/logout")
    assert client.get("/api/sessions").status_code == 401
    r = client.post("/api/auth/login",
                    json={"username": "kapekost", "password": "correct horse battery"})
    assert r.status_code == 200, r.text
    owner_sees_everything(client)                        # a real, freshly-issued session
    with mainmod.db() as conn:                           # and a second device, in parallel
        other = mainmod.issue_session(conn, pid)
        conn.commit()
    owner_sees_everything(_as_session(TestClient(mainmod.app), other))


def test_a_restore_ends_every_session_including_the_importers(mainmod, client, fast_bcrypt):
    """Surfaced by closing the gate, and worth writing down rather than
    discovering during a restore: /api/import replaces the profiles table, and
    auth_sessions cascades from profiles, so a whole-database restore logs
    everyone out — the person who ran it included. The next request is a 401,
    not a 500, and logging back in with the *restored* credentials works.

    The tail of that: if the restored envelope predates passwords, nobody can
    log in over HTTP at all and recovery is bootstrap_owner on the host.
    """
    with mainmod.db() as conn:
        conn.execute("UPDATE profiles SET password_hash = ? WHERE username = 'kapekost'",
                     (mainmod.hash_password("correct horse battery"),))
        conn.commit()
    envelope = client.get("/api/export").json()
    assert client.post("/api/import", json={"mode": "replace", "confirm": True,
                                            "envelope": envelope}).status_code == 200
    assert client.get("/api/sessions").status_code == 401
    with mainmod.db() as conn:
        assert conn.execute("SELECT COUNT(*) FROM auth_sessions").fetchone()[0] == 0
    assert client.post("/api/auth/login",
                       json={"username": "kapekost", "password": "correct horse battery"}
                       ).status_code == 200
    assert client.get("/api/sessions").status_code == 200


# --- per-profile data isolation (#110) ---
# Writes have been attributed to a profile since #66, but reads were never
# scoped, so until #110 any profile could see and modify any other profile's
# rows. These tests drive "who is acting" as two distinct profiles, which is
# what exercises write-attribution and not merely read-side isolation.

@pytest.fixture
def acting_as(mainmod, client):
    """Drive the acting profile for data endpoints (R2). Returns a setter:
    acting_as(profile_id) makes every subsequent request act as that profile.

    Until #86 this monkeypatched acting_profile_id, because there was no login
    to act through — and its docstring claimed it would need no changes when the
    gate closed. That was wrong in the useful direction: with the gate closed
    there is a real mechanism, so the fixture now issues a real session per
    profile and swaps the cookie. Nothing is patched out, which means the
    isolation test below runs against the same code path a browser does — the
    gate included — instead of around it.
    """
    sessions = {}
    def _set(profile_id):
        if profile_id not in sessions:
            with mainmod.db() as conn:
                sessions[profile_id] = mainmod.issue_session(conn, profile_id)
                conn.commit()
        client.cookies.set("wt_session", sessions[profile_id])
    return _set


def test_profiles_cannot_see_or_modify_each_others_data(mainmod, client, acting_as):
    """Table-driven over the full in-scope route list from #110: a route added
    later without scoping should fail this suite, not ship a leak.

    Two profiles (A, B) each get a session with sets, a note and a personal
    best, seeded by acting as each in turn so write-attribution is exercised
    too. Every in-scope read, acting as A, must show A's rows and never B's; a
    fresh profile C with no data must see an empty app. Every in-scope
    mutation against B's row, acting as A, must 404 and leave B's row intact.
    """
    with mainmod.db() as conn:
        a_id = conn.execute("INSERT INTO profiles (username, role) VALUES ('iso_a', 'member')").lastrowid
        b_id = conn.execute("INSERT INTO profiles (username, role) VALUES ('iso_b', 'member')").lastrowid
        c_id = conn.execute("INSERT INTO profiles (username, role) VALUES ('iso_c', 'member')").lastrowid
        conn.commit()

    def seed(profile_id, tag, weight):
        """One profile's data: two completed sessions on its own exercise (so
        sessions/{sid}/prs has real prior history to protect), a note, and a
        personal best. Returns everything a later assertion needs to identify
        this profile's rows."""
        acting_as(profile_id)
        ex, note_ex = f"ex_{tag}", f"note_ex_{tag}"
        base_sid = client.post("/api/sessions", json={"workout_day": "upper_a"}).json()["id"]
        client.post(f"/api/sessions/{base_sid}/sets", json={
            "exercise_id": ex, "exercise_name": ex, "set_number": 1, "reps": 5, "weight_kg": weight})
        client.patch(f"/api/sessions/{base_sid}", json={"completed": True})
        sid = client.post("/api/sessions", json={"workout_day": "upper_a"}).json()["id"]
        set_row = client.post(f"/api/sessions/{sid}/sets", json={
            "exercise_id": ex, "exercise_name": ex, "set_number": 1, "reps": 5,
            "weight_kg": weight + 10}).json()
        client.patch(f"/api/sessions/{sid}", json={"completed": True})
        pb = client.post("/api/personal-bests", json={
            "exercise_id": ex, "exercise_name": ex, "weight_kg": weight - 20,
            "reps": 5, "achieved_year": 2024}).json()
        client.put(f"/api/exercises/{note_ex}/note", json={"note": f"note-{tag}"})
        client.post("/api/events", json=[{"name": f"evt_{tag}", "screen": "Workout"}])
        return {"ex": ex, "note_ex": note_ex, "base_sid": base_sid, "sid": sid,
                "set_id": set_row["id"], "pb_id": pb["id"], "weight": weight}

    a, b = seed(a_id, "a", 50), seed(b_id, "b", 500)

    # --- reads: acting as A must see A's data, and never B's ---
    acting_as(a_id)

    READS = [
        ("GET /api/sessions",
         lambda: client.get("/api/sessions").json(),
         lambda j: {a["base_sid"], a["sid"]} <= {s["id"] for s in j},
         lambda j: b["base_sid"] not in {s["id"] for s in j} and b["sid"] not in {s["id"] for s in j}),
        ("GET /api/personal-bests",
         lambda: client.get("/api/personal-bests").json(),
         lambda j: a["pb_id"] in {p["id"] for p in j},
         lambda j: b["pb_id"] not in {p["id"] for p in j}),
        ("GET /api/notes",
         lambda: client.get("/api/notes").json(),
         lambda j: j.get(a["note_ex"]) == "note-a",
         lambda j: b["note_ex"] not in j),
        ("GET /api/progress",
         lambda: client.get("/api/progress").json(),
         lambda j: a["ex"] in {r["exercise_id"] for r in j},
         lambda j: b["ex"] not in {r["exercise_id"] for r in j}),
        ("GET /api/exercises/recency",
         lambda: client.get("/api/exercises/recency").json(),
         lambda j: a["ex"] in {r["exercise_id"] for r in j},
         lambda j: b["ex"] not in {r["exercise_id"] for r in j}),
        ("GET /api/analytics/summary",
         lambda: client.get("/api/analytics/summary").json(),
         lambda j: "evt_a" in {r["name"] for r in j["by_name"]},
         lambda j: "evt_b" not in {r["name"] for r in j["by_name"]}),
    ]
    for name, call, owns_a, excludes_b in READS:
        body = call()
        assert owns_a(body), f"{name}: missing A's own data"
        assert excludes_b(body), f"{name}: leaked B's data"

    # Exercise-keyed reads: A's own exercise_id already excludes B's rows by
    # accident (different key), so the real scoping proof is asking for B's
    # own exercise_id while acting as A — that must come back empty, not B's
    # real data, which is what an unscoped WHERE clause would otherwise return.
    assert client.get(f"/api/progress/{a['ex']}").json()  # sanity: A has data
    assert client.get(f"/api/progress/{b['ex']}").json() == []
    assert client.get(f"/api/exercises/{a['ex']}/last").json() is not None
    assert client.get(f"/api/exercises/{b['ex']}/last").json() is None

    # Id-keyed read: B's session is invisible to A — 404, not 200.
    assert client.get(f"/api/sessions/{a['sid']}").status_code == 200
    assert client.get(f"/api/sessions/{b['sid']}").status_code == 404

    # sessions/{sid}/prs aggregates "prior" history globally — an unscoped
    # volume comparison lets B's unrelated (much larger) session volume
    # suppress A's own genuine improvement. It must also 404 for a session A
    # does not own rather than compute PRs from B's data.
    prs = client.get(f"/api/sessions/{a['sid']}/prs").json()
    assert "volume" in {p["type"] for p in prs}
    assert client.get(f"/api/sessions/{b['sid']}/prs").status_code == 404

    # --- fresh profile with no data sees an empty app, not someone else's history ---
    acting_as(c_id)
    assert client.get("/api/sessions").json() == []
    assert client.get("/api/personal-bests").json() == []
    assert client.get("/api/notes").json() == {}
    assert client.get("/api/progress").json() == []
    assert client.get(f"/api/progress/{a['ex']}").json() == []
    assert client.get("/api/exercises/recency").json() == []
    assert client.get(f"/api/exercises/{a['ex']}/last").json() is None
    assert client.get("/api/analytics/summary").json()["by_name"] == []
    assert client.get(f"/api/sessions/{a['sid']}").status_code == 404

    # --- mutations: every in-scope mutation against B's row, acting as A, 404s ---
    acting_as(a_id)
    MUTATIONS = [
        ("PATCH session", lambda: client.patch(f"/api/sessions/{b['sid']}", json={"completed": False})),
        ("DELETE session", lambda: client.delete(f"/api/sessions/{b['sid']}")),
        ("DELETE set", lambda: client.delete(f"/api/sessions/{b['sid']}/sets/{b['set_id']}")),
        ("DELETE personal best", lambda: client.delete(f"/api/personal-bests/{b['pb_id']}")),
        ("POST set into foreign session", lambda: client.post(f"/api/sessions/{b['sid']}/sets", json={
            "exercise_id": "hack", "exercise_name": "hack", "set_number": 9, "reps": 1, "weight_kg": 1})),
    ]
    for name, call in MUTATIONS:
        r = call()
        assert r.status_code == 404, f"{name}: expected 404, got {r.status_code}"

    # B's data is unchanged by every rejected mutation attempt above.
    acting_as(b_id)
    b_session = client.get(f"/api/sessions/{b['sid']}").json()
    assert b_session["completed"] == 1
    assert {st["id"] for st in b_session["sets"]} == {b["set_id"]}
    assert any(p["id"] == b["pb_id"] for p in client.get("/api/personal-bests").json())

    # Notes are keyed (profile_id, exercise_id): A writing under B's exercise
    # id creates A's own row and must never touch B's.
    acting_as(a_id)
    client.put(f"/api/exercises/{b['note_ex']}/note", json={"note": "leak-attempt"})
    acting_as(b_id)
    assert client.get("/api/notes").json()[b["note_ex"]] == "note-b"
