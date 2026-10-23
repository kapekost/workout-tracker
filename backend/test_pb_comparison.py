def _share_bests_column(mainmod):
    with mainmod.db() as conn:
        return [r for r in conn.execute("PRAGMA table_info(profiles)") if r[1] == "share_bests"]


def test_migration_adds_share_bests_default_off(mainmod, seed_profile_id):
    col, = _share_bests_column(mainmod)
    assert col[2] == "INTEGER" and col[3] == 1 and col[4] == "0"
    with mainmod.db() as conn:
        assert conn.execute("SELECT share_bests FROM profiles WHERE id = ?", (seed_profile_id,)).fetchone()[0] == 0


def test_a_v9_database_gains_the_column_and_migration_is_idempotent(mainmod, seed_profile_id):
    with mainmod.db() as conn:
        conn.execute("ALTER TABLE profiles DROP COLUMN share_bests")
        conn.execute("PRAGMA user_version = 9")
        conn.commit()
    mainmod.init()
    mainmod.init()
    with mainmod.db() as conn:
        assert conn.execute("PRAGMA user_version").fetchone()[0] == 10
        assert conn.execute("SELECT share_bests FROM profiles WHERE id = ?", (seed_profile_id,)).fetchone()[0] == 0
    assert len(_share_bests_column(mainmod)) == 1


def test_old_v9_envelope_restores_with_sharing_off(client, mainmod, seed_profile_id):
    env = client.get("/api/export").json()
    env["schema_version"] = 9
    for row in env["tables"]["profiles"]:
        del row["share_bests"]
    r = client.post("/api/import", json={"mode": "replace", "confirm": True, "envelope": env})
    assert r.status_code == 200
    with mainmod.db() as conn:
        assert conn.execute("SELECT share_bests FROM profiles WHERE id = ?", (seed_profile_id,)).fetchone()[0] == 0


def test_export_round_trip_keeps_sharing_flag(client, mainmod, seed_profile_id):
    with mainmod.db() as conn:
        conn.execute("UPDATE profiles SET share_bests = 1 WHERE id = ?", (seed_profile_id,))
        conn.commit()
    env = client.get("/api/export").json()
    assert env["tables"]["profiles"][0]["share_bests"] == 1
    r = client.post("/api/import", json={"mode": "replace", "confirm": True, "envelope": env})
    assert r.status_code == 200
    with mainmod.db() as conn:
        assert conn.execute("SELECT share_bests FROM profiles WHERE id = ?", (seed_profile_id,)).fetchone()[0] == 1


from fastapi.testclient import TestClient


def _member(mainmod, username, sharing=False):
    """A logged-in member with their own profile and session cookie."""
    with mainmod.db() as conn:
        pid = conn.execute("INSERT INTO profiles (username, role, share_bests) VALUES (?, 'member', ?)",
                           (username, int(sharing))).lastrowid
        cookie = mainmod.issue_session(conn, pid)
        conn.commit()
    c = TestClient(mainmod.app)
    c.cookies.set("wt_session", cookie)
    return c, pid


def _sharing_of(mainmod, pid):
    with mainmod.db() as conn:
        return conn.execute("SELECT share_bests FROM profiles WHERE id = ?", (pid,)).fetchone()[0]


def test_sharing_defaults_off(client):
    assert client.put("/api/personal-bests/sharing", json={"sharing": False}).json() == {"sharing": False}


def test_sharing_toggle_persists(client, mainmod, seed_profile_id):
    assert client.put("/api/personal-bests/sharing", json={"sharing": True}).json() == {"sharing": True}
    assert _sharing_of(mainmod, seed_profile_id) == 1
    assert client.put("/api/personal-bests/sharing", json={"sharing": False}).json() == {"sharing": False}
    assert _sharing_of(mainmod, seed_profile_id) == 0


def test_sharing_rejects_non_bool(client):
    for bad in ("yes", 1, None):
        assert client.put("/api/personal-bests/sharing", json={"sharing": bad}).status_code == 422
    assert client.put("/api/personal-bests/sharing", json={}).status_code == 422
    assert client.put("/api/personal-bests/sharing", json={"sharing": True, "profile_id": 1}).status_code == 422


def test_sharing_requires_session(anon_client):
    assert anon_client.put("/api/personal-bests/sharing", json={"sharing": True}).status_code == 401


def test_toggle_changes_only_the_callers_profile(client, mainmod, seed_profile_id):
    _, other = _member(mainmod, "other")
    client.put("/api/personal-bests/sharing", json={"sharing": True})
    assert _sharing_of(mainmod, seed_profile_id) == 1
    assert _sharing_of(mainmod, other) == 0
