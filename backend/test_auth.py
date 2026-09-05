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
