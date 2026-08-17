def test_migration_creates_personal_bests_table(mainmod):
    with mainmod.db() as conn:
        assert conn.execute("PRAGMA user_version").fetchone()[0] == 3
        cols = {r[1] for r in conn.execute("PRAGMA table_info(personal_bests)").fetchall()}
        assert cols == {"id", "exercise_id", "exercise_name", "weight_kg", "reps",
                         "achieved_year", "achieved_note", "created_at"}

def test_migration_is_idempotent(mainmod):
    mainmod.init(); mainmod.init()  # second run must not error
    with mainmod.db() as conn:
        assert conn.execute("PRAGMA user_version").fetchone()[0] == 3
