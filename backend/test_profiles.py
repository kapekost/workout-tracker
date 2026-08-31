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

def test_personal_bests_rebuilt_with_profile_scoped_unique(mainmod):
    with mainmod.db() as conn:
        conn.execute("PRAGMA user_version = 3")
        conn.execute("DELETE FROM profiles")
        # personal_bests is a *rebuilt* table (profile_id NOT NULL), not a plain
        # ADD COLUMN one — same reason as exercise_notes above: the mainmod
        # fixture's own init() already migrated it to the v4 shape before this
        # test body runs, so recreate the pre-v4 shape for real to simulate old
        # data, matching _migrate's original v2->v3 definition.
        conn.execute("DROP TABLE personal_bests")
        conn.execute("""
            CREATE TABLE personal_bests (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                exercise_id   TEXT NOT NULL,
                exercise_name TEXT NOT NULL,
                weight_kg     REAL NOT NULL,
                reps          INTEGER NOT NULL,
                achieved_year INTEGER NOT NULL,
                achieved_note TEXT,
                created_at    TEXT NOT NULL DEFAULT (datetime('now')),
                UNIQUE(exercise_id, weight_kg, reps, achieved_year)
            )
        """)
        conn.execute("INSERT INTO personal_bests (exercise_id, exercise_name, weight_kg, reps, achieved_year) "
                     "VALUES ('bench_press','Bench Press',100,3,2023)")
        conn.commit()
    mainmod.init()
    with mainmod.db() as conn:
        assert conn.execute("PRAGMA user_version").fetchone()[0] == 4
        seed_id = conn.execute("SELECT id FROM profiles WHERE username='kapekost'").fetchone()[0]
        row = conn.execute("SELECT profile_id FROM personal_bests WHERE exercise_id='bench_press'").fetchone()
        assert row["profile_id"] == seed_id

def test_second_profile_can_log_the_same_pb_as_the_first(client, mainmod):
    with mainmod.db() as conn:
        other_id = conn.execute("INSERT INTO profiles (username, role) VALUES ('other', 'member')").lastrowid
        conn.commit()
    client.post("/api/personal-bests", json={
        "exercise_id": "bench_press", "exercise_name": "Bench Press",
        "weight_kg": 100, "reps": 3, "achieved_year": 2023})
    with mainmod.db() as conn:
        # Second profile logs the identical lift directly (no API-level profile switch exists yet
        # per this issue's scope) — must not collide on the old single-profile UNIQUE shape.
        conn.execute(
            "INSERT INTO personal_bests (profile_id, exercise_id, exercise_name, weight_kg, reps, achieved_year) "
            "VALUES (?, 'bench_press','Bench Press',100,3,2023)", (other_id,))
        conn.commit()
        assert conn.execute("SELECT COUNT(*) FROM personal_bests").fetchone()[0] == 2

def test_new_session_is_attributed_to_seed_profile(client, mainmod):
    sid = client.post("/api/sessions", json={"workout_day": "upper_a"}).json()["id"]
    with mainmod.db() as conn:
        seed_id = conn.execute("SELECT id FROM profiles WHERE username='kapekost'").fetchone()[0]
        assert conn.execute("SELECT profile_id FROM sessions WHERE id=?", (sid,)).fetchone()[0] == seed_id

def test_new_set_is_attributed_to_seed_profile(client, mainmod):
    sid = client.post("/api/sessions", json={"workout_day": "upper_a"}).json()["id"]
    set_id = client.post(f"/api/sessions/{sid}/sets", json={
        "exercise_id": "bench_press", "exercise_name": "Bench Press",
        "set_number": 1, "reps": 5, "weight_kg": 60}).json()["id"]
    with mainmod.db() as conn:
        seed_id = conn.execute("SELECT id FROM profiles WHERE username='kapekost'").fetchone()[0]
        assert conn.execute("SELECT profile_id FROM sets WHERE id=?", (set_id,)).fetchone()[0] == seed_id

def test_new_personal_best_is_attributed_to_seed_profile(client, mainmod):
    pb_id = client.post("/api/personal-bests", json={
        "exercise_id": "bench_press", "exercise_name": "Bench Press",
        "weight_kg": 100, "reps": 3, "achieved_year": 2023}).json()["id"]
    with mainmod.db() as conn:
        seed_id = conn.execute("SELECT id FROM profiles WHERE username='kapekost'").fetchone()[0]
        assert conn.execute("SELECT profile_id FROM personal_bests WHERE id=?", (pb_id,)).fetchone()[0] == seed_id

def test_new_event_is_attributed_to_seed_profile(client, mainmod):
    client.post("/api/events", json=[{"name": "test_event"}])
    with mainmod.db() as conn:
        seed_id = conn.execute("SELECT id FROM profiles WHERE username='kapekost'").fetchone()[0]
        assert conn.execute("SELECT profile_id FROM events WHERE name='test_event'").fetchone()[0] == seed_id
