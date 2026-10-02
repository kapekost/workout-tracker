"""Guards on POST /api/import — the review's Critical finding.

The endpoint is a database-wide write primitive: `TABLES` starts with
`profiles`, `db()` sets `PRAGMA foreign_keys=ON`, and every data table
declares `REFERENCES profiles(id) ON DELETE CASCADE`. An envelope carrying
`"profiles": []` therefore cascades the whole database to zero, and one
carrying a chosen `password_hash` writes a credential for the seeded admin.

These tests were written red-first against a real running app. Each one fails
on its assertion (or, for the last, on the exact TypeError the review found)
rather than on a fixture error -- that distinction is the whole point of the
gate, so if one of these ever goes red for a setup reason, fix the setup
before believing it.
"""
import bcrypt
import pytest
from fastapi import HTTPException

TABLES = ["profiles", "sessions", "sets", "exercise_notes", "events", "personal_bests"]


@pytest.fixture
def fast(mainmod, monkeypatch):
    """Cost 12 bcrypt is ~200 ms a hash here. Defined locally rather than
    imported: test_auth.py and test_invites.py each declare their own, and a
    module-local fixture is not visible across test files."""
    monkeypatch.setattr(mainmod, "BCRYPT_ROUNDS", 4)
    return mainmod


def _counts(mainmod):
    with mainmod.db() as conn:
        return {t: conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in TABLES}


def _seed_every_table(client):
    """Real rows in every table the envelope can name, so a wipe is measurable."""
    sid = client.post("/api/sessions", json={"workout_day": "upper_a"}).json()["id"]
    client.post(f"/api/sessions/{sid}/sets", json={
        "exercise_id": "bench", "exercise_name": "Bench",
        "set_number": 1, "reps": 5, "weight_kg": 100.0})
    client.put("/api/exercises/bench/note", json={"note": "pause on chest"})
    client.post("/api/personal-bests", json={
        "exercise_id": "bench", "exercise_name": "Bench", "weight_kg": 120.0,
        "reps": 1, "achieved_year": 2024})
    client.post("/api/events", json=[{"name": "screen_view", "screen": "/"}])
    return sid


def _envelope(**overrides):
    env = {"schema_version": 6, "tables": {t: [] for t in TABLES}}
    env.update(overrides)
    return {"mode": "replace", "confirm": True, "envelope": env}


@pytest.fixture
def admin(client, mainmod):
    """An authenticated admin session. The seeded profile is admin but has no
    password, so mint the session directly -- same route the auth tests take."""
    with mainmod.db() as conn:
        pid = conn.execute("SELECT id FROM profiles WHERE username = 'kapekost'").fetchone()[0]
        sid = mainmod.issue_session(conn, pid)
        conn.commit()
    client.cookies.set("wt_session", sid)
    return pid


# --- the gate itself ---

def test_import_requires_an_authenticated_admin(client):
    r = client.post("/api/import", json=_envelope())
    assert r.status_code == 401, f"unauthenticated import returned {r.status_code}: {r.text}"


def test_import_rejects_a_non_admin_session(client, mainmod, fast):
    """Admin-only, not merely authenticated: a member must not be able to
    replace the whole database either."""
    with fast.db() as conn:
        pid = conn.execute(
            "INSERT INTO profiles (username, password_hash, role) VALUES (?,?,?)",
            ("tester", fast.hash_password("correct horse battery"), "member")).lastrowid
        sid = fast.issue_session(conn, pid)
        conn.commit()
    client.cookies.set("wt_session", sid)
    r = client.post("/api/import", json=_envelope())
    assert r.status_code == 403, f"member import returned {r.status_code}: {r.text}"


# --- the cascade wipe, as proven ---

def test_import_cannot_cascade_wipe_via_an_empty_profiles_table(client, mainmod, admin):
    _seed_every_table(client)
    before = _counts(mainmod)
    assert all(v > 0 for v in before.values()), before

    r = client.post("/api/import", json=_envelope())

    assert r.status_code == 400, f"import returned {r.status_code}: {r.text}"
    # Second assertion on purpose: a status-code-only test would pass a future
    # "reject after deleting" regression.
    assert _counts(mainmod) == before, "import destroyed data it should have refused"


def test_import_refuses_to_remove_the_seeded_admin(client, mainmod, admin):
    """The invariant names the seeded profile specifically, not 'some profile':
    _default_profile_id looks up username='kapekost' by name, so a restore that
    keeps a different profile still bricks the app."""
    r = client.post("/api/import", json=_envelope(schema_version=6, tables={
        "profiles": [{"id": 1, "username": "someone-else", "role": "member"}],
        "sessions": [], "sets": [], "exercise_notes": [], "events": [],
        "personal_bests": []}))
    assert r.status_code == 400, f"import returned {r.status_code}: {r.text}"
    with mainmod.db() as conn:
        assert conn.execute("SELECT COUNT(*) FROM profiles WHERE username = 'kapekost'"
                            ).fetchone()[0] == 1


# --- credentials are not an importable column ---

def test_import_refuses_to_write_a_password_hash(client, mainmod, admin, fast):
    """Stays meaningful once the endpoint is admin-only: an admin can still
    plant a credential, or lock a real user out by overwriting their hash."""
    forged = bcrypt.hashpw(b"attacker chosen pw", bcrypt.gensalt(rounds=4)).decode()
    r = client.post("/api/import", json=_envelope(schema_version=6, tables={
        "profiles": [{"id": 1, "username": "kapekost", "role": "admin",
                      "email": "a@b.c", "password_hash": forged}],
        "sessions": [], "sets": [], "exercise_notes": [], "events": [],
        "personal_bests": []}))

    assert r.status_code == 400, f"import returned {r.status_code}: {r.text}"
    with mainmod.db() as conn:
        live = conn.execute("SELECT password_hash FROM profiles WHERE username = 'kapekost'"
                            ).fetchone()[0]
    assert live != forged, "a chosen password_hash reached the profiles table"
    # And it must not be usable.
    assert client.post("/api/auth/login", json={
        "username": "kapekost", "password": "attacker chosen pw"}).status_code == 401


# --- /api/export must not hand the hash back ---

def test_export_omits_password_hash(client):
    for row in client.get("/api/export").json()["tables"]["profiles"]:
        assert "password_hash" not in row, f"export leaked {sorted(row)}"


def test_export_still_carries_the_fields_a_restore_needs(client):
    """The narrowing must not break /api/import's happy path -- the point of the
    export is to be re-importable, so dropping a needed column is a regression."""
    cols = set(client.get("/api/export").json()["tables"]["profiles"][0])
    assert {"id", "username", "role", "icon", "email", "created_at"} <= cols


# --- the health check that reported ok on a bricked app ---

def test_health_is_not_ok_when_no_profile_exists(client, mainmod):
    with mainmod.db() as conn:
        conn.execute("DELETE FROM profiles")   # cascades, exactly as the exploit does
        conn.commit()
    body = client.get("/api/health").json()
    assert body["status"] != "ok", f"health reported {body} on an app with no profile"


def test_health_is_ok_on_a_healthy_app(client):
    """The B5 fix must not turn the deploy gate permanently red."""
    assert client.get("/api/health").json()["status"] == "ok"


def test_missing_default_profile_raises_a_clear_error(mainmod):
    with mainmod.db() as conn:
        conn.execute("DELETE FROM profiles WHERE username = 'kapekost'")
        conn.commit()
        with pytest.raises(HTTPException) as ei:
            mainmod._default_profile_id(conn)
    assert ei.value.status_code == 500
    # Names the thing that is missing, so an operator gets an action rather
    # than a TypeError from three frames down.
    assert "kapekost" in str(ei.value.detail)


# --- a re-minted token must not leave the old one live ---

def test_minting_a_new_token_invalidates_the_previous_one(fast):
    """test_a_token_is_single_use (test_invites.py) covers sequential reuse.
    This covers re-minting, which is the actual gap: a reset token minted
    before a compromise survives the victim's own password reset, because
    set_password only marks the row it redeemed."""
    with fast.db() as conn:
        pid = conn.execute("SELECT id FROM profiles WHERE username = 'kapekost'").fetchone()[0]
        first = fast.mint_token(conn, pid, "reset")
        second = fast.mint_token(conn, pid, "reset")
        conn.commit()
        still_live = conn.execute(
            "SELECT COUNT(*) FROM auth_tokens WHERE token_hash = ? AND used_at IS NULL",
            (fast.hash_token(first),)).fetchone()[0]
    assert still_live == 0, "the superseded token is still redeemable"
    assert first != second
