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
