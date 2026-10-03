"""Three auth hygiene fixes, written against current `main`.

Each of these was a real gap found in review on 2026-10-03. All three are
small, so they are collected here rather than scattered into the larger auth
modules — with the reasoning kept inline, because each one's *why* is the thing
a future reader would otherwise undo.
"""
import pytest


@pytest.fixture
def fast(mainmod, monkeypatch):
    """Cost 12 bcrypt is ~200 ms a hash here; these tests are about token and
    counter bookkeeping, not the work factor."""
    monkeypatch.setattr(mainmod, "BCRYPT_ROUNDS", 4)
    return mainmod


def _profile_id(fast, username="tester"):
    with fast.db() as conn:
        pid = conn.execute(
            "INSERT INTO profiles (username, role) VALUES (?, 'member')", (username,)).lastrowid
        conn.commit()
    return pid


# --- a re-minted token must supersede the old one ---

def test_minting_a_new_token_retires_the_previous_one(fast):
    """Single-use previously meant only "redeemed once".

    mint_token inserted a row and touched nothing else, so a reset link minted
    before a compromise stayed live through the victim's own password reset —
    set_password only marked the row it actually redeemed. Redeeming the stale
    link then rotated the password again and logged the attacker in. The email
    says "this link works once"; that has to be true of the *link*, not just of
    the redemption.
    """
    pid = _profile_id(fast)
    with fast.db() as conn:
        first = fast.mint_token(conn, pid, "reset")
        second = fast.mint_token(conn, pid, "reset")
        conn.commit()
        still_live = conn.execute(
            "SELECT COUNT(*) FROM auth_tokens WHERE token_hash = ? AND used_at IS NULL",
            (fast.hash_token(first),)).fetchone()[0]
        newest_live = conn.execute(
            "SELECT COUNT(*) FROM auth_tokens WHERE token_hash = ? AND used_at IS NULL",
            (fast.hash_token(second),)).fetchone()[0]
    assert still_live == 0, "the superseded token is still redeemable"
    assert newest_live == 1


def test_retiring_one_kind_leaves_the_other_alone(fast):
    """An invite and a reset are different mechanisms with different windows,
    so superseding must not cross the kinds."""
    pid = _profile_id(fast)
    with fast.db() as conn:
        invite = fast.mint_token(conn, pid, "invite")
        fast.mint_token(conn, pid, "reset")
        conn.commit()
        live = conn.execute(
            "SELECT COUNT(*) FROM auth_tokens WHERE token_hash = ? AND used_at IS NULL",
            (fast.hash_token(invite),)).fetchone()[0]
    assert live == 1, "minting a reset retired an unrelated invite"


def test_retiring_is_per_profile(fast):
    """One account's re-invite must not lock another account out."""
    a, b = _profile_id(fast, "alice"), _profile_id(fast, "bob")
    with fast.db() as conn:
        bobs = fast.mint_token(conn, b, "invite")
        fast.mint_token(conn, a, "invite")   # a different profile re-invites
        fast.mint_token(conn, a, "invite")
        conn.commit()
        live = conn.execute(
            "SELECT COUNT(*) FROM auth_tokens WHERE token_hash = ? AND used_at IS NULL",
            (fast.hash_token(bobs),)).fetchone()[0]
    assert live == 1


# --- redemption must be atomic ---

def test_a_token_cannot_be_redeemed_twice(fast, client):
    """Plain single-use: the second attempt is refused."""
    pid = _profile_id(fast)
    with fast.db() as conn:
        raw = fast.mint_token(conn, pid, "invite")
        conn.commit()
    body = {"token": raw, "password": "correct horse battery"}

    first = client.post("/api/auth/set-password", json=body)
    assert first.status_code == 200, first.text
    # The session cookie is now set; clear it so the second attempt is anonymous.
    client.cookies.clear()
    second = client.post("/api/auth/set-password", json=body)
    assert second.status_code == 400, f"second redemption returned {second.status_code}"
    assert "invalid or has expired" in second.json()["detail"]


def test_a_redemption_losing_a_race_refuses_rather_than_writing(fast, client):
    """The race the SELECT's `used_at IS NULL` predicate cannot catch.

    Sequentially, reuse is already blocked: the second request's SELECT finds
    nothing. The actual defect needs both requests to pass that SELECT before
    either commits. So this simulates the interleaving directly — a concurrent
    claimant consumes the token in the window between our SELECT and our write
    — and asserts the request still refuses.

    The old code marked the token with a bare `UPDATE ... WHERE id = ?` and
    wrote the password first, so it answered 200 and overwrote the winner's
    credential. Claiming with `WHERE id = ? AND used_at IS NULL` plus a rowcount
    check makes the loser fail instead. This is the test that tells those two
    implementations apart; the sequential one above cannot.
    """
    pid = _profile_id(fast)
    with fast.db() as conn:
        raw = fast.mint_token(conn, pid, "invite")
        conn.commit()

    real_hash = fast.hash_password

    def racing_claim(password):
        """Stands in for the hash step, and is where the race is injected:
        another request redeems this token right after we SELECTed it."""
        with fast.db() as conn:
            conn.execute("UPDATE auth_tokens SET used_at = datetime('now') "
                         "WHERE token_hash = ?", (fast.hash_token(raw),))
            conn.commit()
        return real_hash(password)

    fast.hash_password = racing_claim
    try:
        r = client.post("/api/auth/set-password",
                        json={"token": raw, "password": "correct horse battery"})
    finally:
        fast.hash_password = real_hash

    assert r.status_code == 400, f"losing racer returned {r.status_code}: {r.text}"
    with fast.db() as conn:
        stored = conn.execute("SELECT password_hash FROM profiles WHERE id = ?", (pid,)).fetchone()[0]
    assert stored is None, "the losing redemption still wrote a password"


def test_a_rejected_redemption_does_not_change_the_password(fast, client):
    """The claim happens before the hash is spent, so a losing racer must leave
    the stored credential exactly as the winner set it."""
    pid = _profile_id(fast)
    with fast.db() as conn:
        raw = fast.mint_token(conn, pid, "invite")
        conn.commit()
    assert client.post("/api/auth/set-password",
                       json={"token": raw, "password": "correct horse battery"}).status_code == 200
    client.cookies.clear()
    client.post("/api/auth/set-password", json={"token": raw, "password": "attacker chosen pw"})
    with fast.db() as conn:
        stored = conn.execute("SELECT password_hash FROM profiles WHERE id = ?", (pid,)).fetchone()[0]
    assert fast.verify_password("correct horse battery", stored)
    assert not fast.verify_password("attacker chosen pw", stored)


# --- the rate-limit window store must not grow without bound ---

def test_expired_rate_limit_windows_are_evicted(fast):
    """_rate_windows is process-global and nothing ever removed a key, while the
    per-subject keys are attacker-chosen (user: up to 64 chars, email: up to
    254). That is unbounded growth in a ~1 GB box, from a public endpoint, for
    the cost of one request per distinct name."""
    fast.reset_rate_limits()
    with pytest.MonkeyPatch.context() as mp:
        now = 1_000_000.0
        mp.setattr(fast.time, "time", lambda: now)
        for i in range(fast._RATE_LIMIT_SWEEP_AT + 40):
            fast._rate_limit_hit(f"user:sprayed-{i}")
        assert len(fast._rate_windows) > 0
        # Jump past the window; the next hit sweeps everything already expired.
        mp.setattr(fast.time, "time", lambda: now + fast.RATE_LIMIT_WINDOW_S + 1)
        fast._rate_limit_hit("user:one-more")
        assert len(fast._rate_windows) == 1, "expired windows were never evicted"
    fast.reset_rate_limits()


def test_eviction_never_drops_a_live_window(fast):
    """The sweep must only remove windows that have actually expired, or it
    hands an attacker free attempts by resetting their own counter."""
    fast.reset_rate_limits()
    with pytest.MonkeyPatch.context() as mp:
        now = 2_000_000.0
        mp.setattr(fast.time, "time", lambda: now)
        for i in range(fast._RATE_LIMIT_SWEEP_AT + 40):
            fast._rate_limit_hit(f"user:live-{i}")
        # Not a single window has aged out, so the dict must still hold them all.
        fast._rate_limit_hit("user:trigger-the-sweep")
        assert len(fast._rate_windows) >= fast._RATE_LIMIT_SWEEP_AT
    fast.reset_rate_limits()

# --- the limiter must be safe under the concurrency it actually gets ---

def test_concurrent_hits_never_raise(fast):
    """The two limiter callers are sync `def` endpoints, so Starlette runs them
    in the anyio worker threadpool (40 threads by default) and they genuinely
    run concurrently.

    The first version of the sweep built its eviction list by iterating the live
    dict and then `del`-ing from it. Two threads doing that raise
    `RuntimeError: dictionary changed size during iteration`, or `KeyError` when
    they build the same eviction list and race the removal — and both escape the
    request thread *before* the 429 decision, so login 500s instead of
    throttling. Reproduced at 12 of 16 threads before the lock and the snapshot.
    """
    import threading
    fast.reset_rate_limits()
    with pytest.MonkeyPatch.context() as mp:
        now = 3_000_000.0
        mp.setattr(fast.time, "time", lambda: now)
        # Seed a store far past the sweep threshold with all-expired windows, so
        # every concurrent hit triggers a sweep.
        for i in range(2000):
            fast._rate_windows[f"seed:{i}"] = (0.0, 1)
        fast._RATE_LIMIT_SWEEP_AT = 8

        errors: list[str] = []

        def hammer(n):
            try:
                for i in range(200):
                    fast._rate_limit_hit(f"user:{n}-{i}")
            except Exception as exc:      # noqa: BLE001 - that is the assertion
                errors.append(f"{type(exc).__name__}: {exc}")

        threads = [threading.Thread(target=hammer, args=(n,)) for n in range(16)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
    assert not errors, f"{len(errors)}/16 threads raised: {errors[:3]}"


def test_the_store_is_hard_capped(fast):
    """Sweeping expired windows does not bound growth *within* a window, because
    `enforce_rate_limit` evaluates every key it is handed even after the request
    is already doomed to a 429. So distinct usernames keep adding keys for the
    whole window. Measured before this cap: 3001 keys from 3000 blocked
    requests, and per-hit cost rising 56x (14us -> 787us at 60k keys).

    The cap must not weaken the limit itself: the per-IP counter still trips, so
    an attacker is still throttled even once the store refuses new identities.
    """
    fast.reset_rate_limits()
    with pytest.MonkeyPatch.context() as mp:
        now = 4_000_000.0
        mp.setattr(fast.time, "time", lambda: now)   # nothing ever expires
        fast._RATE_LIMIT_MAX_KEYS = 64
        for i in range(5000):
            fast._rate_limit_hit(f"user:sprayed-{i}")
        size = len(fast._rate_windows)
    assert size <= 64, f"store grew to {size} keys, cap was 64"
    fast.reset_rate_limits()


def test_the_cap_does_not_disable_the_limiter(fast, client):
    """The real protection is the per-IP counter. Fill the store, then confirm a
    single IP is still throttled — a cap that silently turned the limiter off
    would be worse than the leak it fixed."""
    fast.reset_rate_limits()
    with pytest.MonkeyPatch.context() as mp:
        now = 5_000_000.0
        mp.setattr(fast.time, "time", lambda: now)
        fast._RATE_LIMIT_MAX_KEYS = 4
        codes = [client.post("/api/auth/login",
                            json={"username": f"u{i}", "password": "x" * 20}).status_code
                 for i in range(12)]
    assert 429 in codes, f"IP was never throttled: {codes}"
    assert codes[-1] == 429
    fast.reset_rate_limits()


def _req(host):
    import types
    return types.SimpleNamespace(client=types.SimpleNamespace(host=host))


def test_a_full_store_does_not_let_a_fresh_ip_through(fast):
    """One IP filling the store must not switch the limiter off for everyone
    else. A key that cannot be tracked is treated as over the limit."""
    fast.reset_rate_limits()
    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(fast.time, "time", lambda: 6_000_000.0)
        mp.setattr(fast, "_RATE_LIMIT_MAX_KEYS", 4)
        for i in range(20):
            try:
                fast.enforce_rate_limit(_req("10.0.0.1"), f"user:spray{i}")
            except fast.HTTPException:
                pass
        throttled = 0
        for _ in range(12):
            try:
                fast.enforce_rate_limit(_req("10.0.0.2"), "user:victim")
            except fast.HTTPException as e:
                assert e.status_code == 429
                throttled += 1
    assert throttled > 0, "a fresh IP was never throttled once the store was full"
    fast.reset_rate_limits()


def test_an_ip_already_over_does_not_create_subject_keys(fast):
    """Once the IP counter is over, further usernames must not grow the store."""
    fast.reset_rate_limits()
    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(fast.time, "time", lambda: 7_000_000.0)
        for i in range(fast.RATE_LIMIT_MAX + 1):
            try:
                fast.enforce_rate_limit(_req("10.0.0.3"), f"user:a{i}")
            except fast.HTTPException:
                pass
        before = len(fast._rate_windows)
        for i in range(50):
            try:
                fast.enforce_rate_limit(_req("10.0.0.3"), f"user:b{i}")
            except fast.HTTPException:
                pass
        after = len(fast._rate_windows)
    assert after == before, f"store grew from {before} to {after} after the IP was over"
    fast.reset_rate_limits()
