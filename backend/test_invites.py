"""Accounts step 2 (#85): token minting, invite/reset email, set-password, rate limiting."""
import pytest


@pytest.fixture
def fast(mainmod, monkeypatch):
    """Cost 12 is ~200 ms a hash here; these tests are about the token flow."""
    monkeypatch.setattr(mainmod, "BCRYPT_ROUNDS", 4)
    return mainmod


@pytest.fixture
def sent(fast, monkeypatch):
    """Capture mail at the seam instead of sending it.

    The bootstrap does a real Resend send on purpose (it proves the integration
    on live infrastructure); the test suite never does.
    """
    box = []
    monkeypatch.setattr(fast, "send_email", lambda to, subject, body: box.append(
        {"to": to, "subject": subject, "body": body}))
    return box


def _profile(fast, username="member", email="m@example.com", password_hash=None, role="member"):
    with fast.db() as conn:
        pid = conn.execute(
            "INSERT INTO profiles (username, email, password_hash, role) VALUES (?,?,?,?)",
            (username, email, password_hash, role)).lastrowid
        conn.commit()
    return pid


# --- token minting ---

def test_mint_token_stores_only_the_hash(fast):
    pid = _profile(fast)
    with fast.db() as conn:
        raw = fast.mint_token(conn, pid, "invite")
        conn.commit()
        rows = conn.execute("SELECT token_hash, kind, used_at FROM auth_tokens").fetchall()
    assert len(raw) >= 32
    assert len(rows) == 1
    assert rows[0]["token_hash"] != raw          # the raw value is never stored
    assert raw not in rows[0]["token_hash"]
    assert rows[0]["token_hash"] == fast.hash_token(raw)
    assert rows[0]["kind"] == "invite" and rows[0]["used_at"] is None


def test_invite_expires_in_seven_days_and_reset_in_one_hour(fast):
    pid = _profile(fast)
    with fast.db() as conn:
        fast.mint_token(conn, pid, "invite")
        fast.mint_token(conn, pid, "reset")
        conn.commit()
        inv = conn.execute("SELECT expires_at FROM auth_tokens WHERE kind='invite'").fetchone()[0]
        res = conn.execute("SELECT expires_at FROM auth_tokens WHERE kind='reset'").fetchone()[0]
        # An invite goes to someone expecting it who may not act for days; a
        # reset can be triggered by anyone who knows an address.
        assert conn.execute("SELECT ? > datetime('now','+6 days') AND ? < datetime('now','+8 days')",
                            (inv, inv)).fetchone()[0] == 1
        assert conn.execute("SELECT ? > datetime('now','+50 minutes') AND ? < datetime('now','+70 minutes')",
                            (res, res)).fetchone()[0] == 1


def test_token_hashes_are_unique_per_mint(fast):
    pid = _profile(fast)
    with fast.db() as conn:
        a, b = fast.mint_token(conn, pid, "invite"), fast.mint_token(conn, pid, "invite")
        conn.commit()
    assert a != b


# --- POST /api/auth/set-password ---

def test_set_password_with_a_valid_invite_logs_the_user_in(fast, client):
    pid = _profile(fast)
    with fast.db() as conn:
        raw = fast.mint_token(conn, pid, "invite")
        conn.commit()
    r = client.post("/api/auth/set-password", json={"token": raw, "password": "correct horse battery"})
    assert r.status_code == 200, r.text
    assert r.json()["username"] == "member"
    assert "wt_session=" in r.headers["set-cookie"]
    assert client.get("/api/auth/me").status_code == 200
    with fast.db() as conn:
        assert conn.execute("SELECT password_hash FROM profiles WHERE id=?", (pid,)).fetchone()[0]
        assert conn.execute("SELECT used_at FROM auth_tokens").fetchone()[0] is not None


def test_a_token_is_single_use(fast, client):
    pid = _profile(fast)
    with fast.db() as conn:
        raw = fast.mint_token(conn, pid, "invite")
        conn.commit()
    assert client.post("/api/auth/set-password",
                       json={"token": raw, "password": "correct horse battery"}).status_code == 200
    second = client.post("/api/auth/set-password",
                         json={"token": raw, "password": "another good password"})
    assert second.status_code == 400


def test_expired_unknown_and_used_tokens_share_one_generic_message(fast, client):
    pid = _profile(fast)
    with fast.db() as conn:
        expired = fast.mint_token(conn, pid, "invite")
        conn.execute("UPDATE auth_tokens SET expires_at = datetime('now','-1 day')")
        conn.commit()
    a = client.post("/api/auth/set-password", json={"token": expired, "password": "correct horse battery"})
    b = client.post("/api/auth/set-password", json={"token": "never-existed", "password": "correct horse battery"})
    assert a.status_code == b.status_code == 400
    assert a.json()["detail"] == b.json()["detail"]


def test_set_password_enforces_the_password_rules(fast, client):
    pid = _profile(fast)
    with fast.db() as conn:
        raw = fast.mint_token(conn, pid, "invite")
        conn.commit()
    r = client.post("/api/auth/set-password", json={"token": raw, "password": "short"})
    assert r.status_code == 400          # a clear 400, never a 500 out of bcrypt
    with fast.db() as conn:              # and the token survives for a real attempt
        assert conn.execute("SELECT used_at FROM auth_tokens").fetchone()[0] is None


def test_set_password_revokes_every_existing_session(fast, client):
    pid = _profile(fast, password_hash=None)
    with fast.db() as conn:
        old_a, old_b = fast.issue_session(conn, pid), fast.issue_session(conn, pid)
        raw = fast.mint_token(conn, pid, "reset")
        conn.commit()
    r = client.post("/api/auth/set-password", json={"token": raw, "password": "correct horse battery"})
    assert r.status_code == 200
    with fast.db() as conn:
        # The whole reason sessions are server-side rows: a reset must end the
        # sessions a thief may already hold.
        assert fast.session_profile(conn, old_a) is None
        assert fast.session_profile(conn, old_b) is None
        assert conn.execute("SELECT COUNT(*) FROM auth_sessions WHERE profile_id=?",
                            (pid,)).fetchone()[0] == 1   # only the fresh one


# --- POST /api/auth/forgot-password ---

def test_forgot_password_is_identical_for_known_and_unknown_addresses(fast, client, sent):
    _profile(fast, email="known@example.com")
    known = client.post("/api/auth/forgot-password", json={"email": "known@example.com"})
    unknown = client.post("/api/auth/forgot-password", json={"email": "nobody@example.com"})
    assert known.status_code == unknown.status_code == 200
    assert known.json() == unknown.json()


def test_forgot_password_emails_only_a_real_address(fast, client, sent):
    _profile(fast, email="known@example.com")
    client.post("/api/auth/forgot-password", json={"email": "known@example.com"})
    client.post("/api/auth/forgot-password", json={"email": "nobody@example.com"})
    assert [m["to"] for m in sent] == ["known@example.com"]
    with fast.db() as conn:
        assert conn.execute("SELECT COUNT(*) FROM auth_tokens").fetchone()[0] == 1


def test_forgot_password_on_a_never_invited_account_still_works(fast, client, sent):
    # A member who never opened their invite can self-serve rather than being
    # told to contact an admin.
    _profile(fast, email="fresh@example.com", password_hash=None)
    r = client.post("/api/auth/forgot-password", json={"email": "fresh@example.com"})
    assert r.status_code == 200
    assert len(sent) == 1
    raw = _token_from(sent[0]["body"])
    assert client.post("/api/auth/set-password",
                       json={"token": raw, "password": "correct horse battery"}).status_code == 200


def _token_from(body):
    import re
    m = re.search(r"set-password\?token=([A-Za-z0-9_\-]+)", body)
    assert m, f"no set-password link in: {body}"
    return m.group(1)


def test_the_emailed_link_uses_app_base_url_and_carries_the_raw_token(fast, client, sent, monkeypatch):
    monkeypatch.setattr(fast, "APP_BASE_URL", "http://example.test:8080")
    pid = _profile(fast, email="known@example.com")
    client.post("/api/auth/forgot-password", json={"email": "known@example.com"})
    body = sent[0]["body"]
    assert "http://example.test:8080/set-password?token=" in body
    raw = _token_from(body)
    with fast.db() as conn:  # the email carries the raw value; the DB has only its hash
        stored = conn.execute("SELECT token_hash FROM auth_tokens").fetchone()[0]
    assert stored == fast.hash_token(raw) and stored != raw


# --- admin-only profile creation ---

def _admin_session(fast, client):
    with fast.db() as conn:
        pid = conn.execute("SELECT id FROM profiles WHERE username='kapekost'").fetchone()[0]
        sid = fast.issue_session(conn, pid)
        conn.commit()
    client.cookies.set("wt_session", sid)
    return client


def test_creating_a_profile_requires_an_admin_session(fast, client, sent):
    anon = client.post("/api/profiles", json={"username": "newbie", "email": "n@example.com"})
    assert anon.status_code == 401
    member = _profile(fast, username="plain", email="p@example.com")
    with fast.db() as conn:
        sid = fast.issue_session(conn, member)
        conn.commit()
    client.cookies.set("wt_session", sid)
    assert client.post("/api/profiles",
                       json={"username": "newbie", "email": "n@example.com"}).status_code == 403


def test_admin_creating_a_profile_mints_an_invite_and_emails_it(fast, client, sent):
    c = _admin_session(fast, client)
    r = c.post("/api/profiles", json={"username": "newbie", "email": "n@example.com"})
    assert r.status_code == 201, r.text
    assert r.json()["invite_sent"] is True
    assert [m["to"] for m in sent] == ["n@example.com"]
    with fast.db() as conn:
        assert conn.execute("SELECT kind FROM auth_tokens").fetchone()[0] == "invite"
    raw = _token_from(sent[0]["body"])
    c.cookies.clear()
    assert c.post("/api/auth/set-password",
                  json={"token": raw, "password": "correct horse battery"}).status_code == 200


def test_a_failed_send_still_creates_the_profile_and_says_so(fast, client, monkeypatch):
    def boom(to, subject, body):
        raise RuntimeError("resend is down")
    monkeypatch.setattr(fast, "send_email", boom)
    c = _admin_session(fast, client)
    r = c.post("/api/profiles", json={"username": "newbie", "email": "n@example.com"})
    # Not a 500, and not a half-created account: the admin gets a clear result
    # and can re-send.
    assert r.status_code == 201, r.text
    assert r.json()["invite_sent"] is False
    with fast.db() as conn:
        assert conn.execute("SELECT COUNT(*) FROM profiles WHERE username='newbie'").fetchone()[0] == 1


def test_a_duplicate_username_or_email_is_rejected(fast, client, sent):
    c = _admin_session(fast, client)
    assert c.post("/api/profiles", json={"username": "newbie", "email": "n@example.com"}).status_code == 201
    assert c.post("/api/profiles", json={"username": "newbie", "email": "other@example.com"}).status_code == 409
    assert c.post("/api/profiles", json={"username": "other", "email": "n@example.com"}).status_code == 409


# --- rate limiting ---

@pytest.fixture
def limited(fast):
    """A clean limiter per test — it is process-global by design."""
    fast.reset_rate_limits()
    return fast


def test_login_429s_after_ten_attempts_in_the_window(limited, client):
    _profile(limited, username="tester", email="t@example.com",
             password_hash=limited.hash_password("correct horse battery"))
    bad = {"username": "tester", "password": "wrong horse battery"}
    codes = [client.post("/api/auth/login", json=bad).status_code for _ in range(10)]
    assert codes == [401] * 10
    # Cost-12 hashing is 627 ms of CPU on a 4-core box that also runs Home
    # Assistant. Unthrottled, this endpoint is a CPU amplifier.
    assert client.post("/api/auth/login", json=bad).status_code == 429


def test_the_limiter_blocks_the_correct_password_too(limited, client):
    _profile(limited, username="tester", email="t@example.com",
             password_hash=limited.hash_password("correct horse battery"))
    for _ in range(10):
        client.post("/api/auth/login", json={"username": "tester", "password": "wrong horse battery"})
    # Otherwise the limiter is trivially bypassed by guessing right eventually.
    r = client.post("/api/auth/login", json={"username": "tester", "password": "correct horse battery"})
    assert r.status_code == 429
    assert "set-cookie" not in r.headers


def test_a_rate_limited_login_does_no_hashing(limited, client, monkeypatch):
    _profile(limited, username="tester", email="t@example.com",
             password_hash=limited.hash_password("correct horse battery"))
    bad = {"username": "tester", "password": "wrong horse battery"}
    for _ in range(10):
        client.post("/api/auth/login", json=bad)
    calls = []
    monkeypatch.setattr(limited, "verify_password",
                        lambda *a, **k: calls.append(1) or False)
    client.post("/api/auth/login", json=bad)
    # The point of the limit is to *not spend the CPU*. Rejecting after hashing
    # would leave the amplifier fully intact.
    assert calls == []


def test_forgot_password_is_rate_limited_too(limited, client, sent):
    _profile(limited, email="known@example.com")
    body = {"email": "known@example.com"}
    codes = [client.post("/api/auth/forgot-password", json=body).status_code for _ in range(10)]
    assert codes == [200] * 10
    assert client.post("/api/auth/forgot-password", json=body).status_code == 429


def test_the_window_expires(limited, client, monkeypatch):
    _profile(limited, username="tester", email="t@example.com",
             password_hash=limited.hash_password("correct horse battery"))
    bad = {"username": "tester", "password": "wrong horse battery"}
    for _ in range(10):
        client.post("/api/auth/login", json=bad)
    assert client.post("/api/auth/login", json=bad).status_code == 429
    now = limited.time.time()
    monkeypatch.setattr(limited.time, "time", lambda: now + limited.RATE_LIMIT_WINDOW_S + 1)
    assert client.post("/api/auth/login", json=bad).status_code == 401


def test_the_ip_counter_also_bites_across_usernames(limited, client):
    _profile(limited, username="tester", email="t@example.com",
             password_hash=limited.hash_password("correct horse battery"))
    _profile(limited, username="other", email="o@example.com",
             password_hash=limited.hash_password("another good password"))
    for _ in range(10):
        client.post("/api/auth/login", json={"username": "tester", "password": "wrong horse battery"})
    # Per the spec, the limit is keyed by IP *and* by username, so a source
    # hammering one account is throttled even when it switches usernames.
    # Accepted consequence: a household behind one NAT shares the IP budget for
    # the rest of the window. Worth revisiting if #27 ever makes this public and
    # real users start colliding — for 3-4 accounts it is the right trade.
    r = client.post("/api/auth/login", json={"username": "other", "password": "another good password"})
    assert r.status_code == 429


def test_a_different_source_ip_is_counted_separately(limited, client):
    _profile(limited, username="tester", email="t@example.com",
             password_hash=limited.hash_password("correct horse battery"))
    for _ in range(11):
        client.post("/api/auth/login", json={"username": "tester", "password": "wrong horse battery"})
    assert limited._rate_limit_hit("ip:198.51.100.7") is False


# --- owner bootstrap ---

def test_bootstrap_sets_the_email_and_mints_an_invite(fast, sent):
    result = fast.bootstrap_owner("owner@example.com", username="kapekost")
    assert result["kind"] == "invite"      # seeded profile has no password yet
    assert result["sent"] is True
    with fast.db() as conn:
        assert conn.execute("SELECT email FROM profiles WHERE username='kapekost'"
                            ).fetchone()[0] == "owner@example.com"
        assert conn.execute("SELECT kind FROM auth_tokens").fetchone()[0] == "invite"
    assert [m["to"] for m in sent] == ["owner@example.com"]


def test_bootstrap_goes_through_the_normal_invite_path_not_a_backdoor(fast, sent, client):
    fast.bootstrap_owner("owner@example.com", username="kapekost")
    raw = _token_from(sent[0]["body"])
    # The owner's account is created by exactly the mechanism every other
    # account uses — that is what proves the flow before anyone else is invited.
    r = client.post("/api/auth/set-password", json={"token": raw, "password": "correct horse battery"})
    assert r.status_code == 200
    assert r.json()["role"] == "admin"
    assert client.post("/api/auth/login",
                       json={"username": "kapekost", "password": "correct horse battery"}
                       ).status_code == 200


def test_bootstrap_on_an_account_that_already_has_a_password_sends_a_reset(fast, sent):
    with fast.db() as conn:
        conn.execute("UPDATE profiles SET password_hash = ? WHERE username='kapekost'",
                     (fast.hash_password("correct horse battery"),))
        conn.commit()
    assert fast.bootstrap_owner("owner@example.com", username="kapekost")["kind"] == "reset"


def test_bootstrap_refuses_an_unknown_username(fast, sent):
    with pytest.raises(ValueError, match="no profile"):
        fast.bootstrap_owner("owner@example.com", username="nobody")


def test_bootstrap_reports_a_send_failure_instead_of_raising(fast, monkeypatch):
    def boom(to, subject, body):
        raise RuntimeError("resend is down")
    monkeypatch.setattr(fast, "send_email", boom)
    result = fast.bootstrap_owner("owner@example.com", username="kapekost")
    # The token is minted and the email is recorded either way — re-running the
    # script re-sends rather than leaving a half-done bootstrap.
    assert result["sent"] is False
    with fast.db() as conn:
        assert conn.execute("SELECT COUNT(*) FROM auth_tokens").fetchone()[0] == 1


# --- the Resend request itself ---

def test_send_email_sets_a_real_user_agent(fast, monkeypatch):
    """Cloudflare fronts api.resend.com and blocks urllib's default agent with a
    403 (Cloudflare error 1010), which reads exactly like a bad API key. Caught
    on the first real send, 2026-09-05."""
    seen = {}

    class _Resp:
        status = 200
        def __enter__(self): return self
        def __exit__(self, *a): return False

    monkeypatch.setattr(fast, "RESEND_API_KEY", "re_test")
    monkeypatch.setattr(fast, "MAIL_FROM", "Test <t@example.com>")
    monkeypatch.setattr(fast.urllib.request, "urlopen",
                        lambda req, timeout=None: seen.update(req.headers) or _Resp())
    fast.send_email("to@example.com", "subject", "body")
    agent = seen.get("User-agent", "")
    assert agent and not agent.startswith("Python-urllib")


def test_send_email_reports_the_response_body_on_an_http_error(fast, monkeypatch):
    import io
    import urllib.error

    def boom(req, timeout=None):
        raise urllib.error.HTTPError(req.full_url, 403, "Forbidden", {},
                                     io.BytesIO(b"error code: 1010"))

    monkeypatch.setattr(fast, "RESEND_API_KEY", "re_test")
    monkeypatch.setattr(fast, "MAIL_FROM", "Test <t@example.com>")
    monkeypatch.setattr(fast.urllib.request, "urlopen", boom)
    with pytest.raises(RuntimeError, match="1010"):
        # A bare "403" sent the first diagnosis down the wrong path.
        fast.send_email("to@example.com", "subject", "body")
