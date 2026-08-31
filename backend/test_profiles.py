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

def test_existing_sessions_sets_events_backfilled_to_seed_profile(mainmod):
    # Simulate pre-migration data: reset to v3, insert rows the old-fashioned way, re-migrate.
    with mainmod.db() as conn:
        conn.execute("PRAGMA user_version = 3")
        conn.execute("DELETE FROM profiles")
        conn.execute("INSERT INTO sessions (date, workout_day) VALUES ('2026-01-01','upper_a')")
        conn.execute("INSERT INTO sets (session_id, exercise_id, exercise_name, set_number, reps, weight_kg) "
                     "VALUES (1,'bench_press','Bench Press',1,5,60)")
        conn.execute("INSERT INTO events (name) VALUES ('test_event')")
        conn.commit()
    mainmod.init()
    with mainmod.db() as conn:
        seed_id = conn.execute("SELECT id FROM profiles WHERE username='kapekost'").fetchone()[0]
        assert conn.execute("SELECT profile_id FROM sessions WHERE id=1").fetchone()[0] == seed_id
        assert conn.execute("SELECT profile_id FROM sets WHERE session_id=1").fetchone()[0] == seed_id
        assert conn.execute("SELECT profile_id FROM events WHERE name='test_event'").fetchone()[0] == seed_id

def test_exercise_notes_rebuilt_with_composite_pk(mainmod):
    with mainmod.db() as conn:
        conn.execute("PRAGMA user_version = 3")
        conn.execute("DELETE FROM profiles")
        # exercise_notes is a *rebuilt* table (composite PK), not a plain ADD
        # COLUMN one: the mainmod fixture's own init() already migrated it to
        # the v4 shape (profile_id NOT NULL) before this test body runs, so
        # resetting user_version alone (as suffices for sessions/sets/events)
        # doesn't bring back the old shape. Recreate the pre-v4 table for real
        # to simulate old data, matching init()'s own original definition.
        conn.execute("DROP TABLE exercise_notes")
        conn.execute("""
            CREATE TABLE exercise_notes (
                exercise_id TEXT PRIMARY KEY,
                note TEXT NOT NULL,
                updated_at TEXT DEFAULT (datetime('now'))
            )
        """)
        conn.execute("INSERT INTO exercise_notes (exercise_id, note) VALUES ('bench_press', 'go slow')")
        conn.commit()
    mainmod.init()
    with mainmod.db() as conn:
        seed_id = conn.execute("SELECT id FROM profiles WHERE username='kapekost'").fetchone()[0]
        cols = {r[1] for r in conn.execute("PRAGMA table_info(exercise_notes)").fetchall()}
        assert cols == {"profile_id", "exercise_id", "note", "updated_at"}
        row = conn.execute("SELECT profile_id, note FROM exercise_notes WHERE exercise_id='bench_press'").fetchone()
        assert row["profile_id"] == seed_id and row["note"] == "go slow"
        pk_cols = {r[1] for r in conn.execute("PRAGMA table_info(exercise_notes)").fetchall() if r[5] > 0}
        assert pk_cols == {"profile_id", "exercise_id"}

def test_put_note_upsert_keys_on_profile_and_exercise(client):
    client.put("/api/exercises/bench_press/note", json={"note": "first"})
    r = client.put("/api/exercises/bench_press/note", json={"note": "updated"})
    assert r.status_code == 200
    notes = client.get("/api/notes").json()
    assert notes["bench_press"] == "updated"  # same (seed profile, exercise) pair -> upsert, not duplicate
