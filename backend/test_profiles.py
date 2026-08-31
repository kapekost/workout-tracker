def test_migration_creates_profiles_table_with_seeded_admin(mainmod):
    with mainmod.db() as conn:
        cols = {r[1] for r in conn.execute("PRAGMA table_info(profiles)").fetchall()}
        assert cols == {"id", "username", "password_hash", "role", "created_at"}
        rows = conn.execute("SELECT username, role, password_hash FROM profiles").fetchall()
        assert len(rows) == 1
        assert rows[0]["username"] == "kapekost"
        assert rows[0]["role"] == "admin"
        assert rows[0]["password_hash"] is None

def test_migration_seed_is_idempotent(mainmod):
    mainmod.init(); mainmod.init()  # second run must not error or duplicate the seed
    with mainmod.db() as conn:
        assert conn.execute("SELECT COUNT(*) FROM profiles").fetchone()[0] == 1
