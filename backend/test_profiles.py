from fastapi.testclient import TestClient


def _member_client(mainmod):
    """A second, member-role profile with its own real session cookie — not a
    raw row we then never authenticate as, per
    test_second_profile_can_log_the_same_pb_as_the_first's pattern for
    creating the profile, and conftest.py's `client` fixture / issue_session
    for putting a real session on a client of its own."""
    with mainmod.db() as conn:
        member_id = conn.execute(
            "INSERT INTO profiles (username, role) VALUES ('plain', 'member')").lastrowid
        member = TestClient(mainmod.app)
        member.cookies.set("wt_session", mainmod.issue_session(conn, member_id))
        conn.commit()
    return member, member_id


def test_migration_creates_profiles_table_with_seeded_admin(mainmod):
    with mainmod.db() as conn:
        cols = {r[1] for r in conn.execute("PRAGMA table_info(profiles)").fetchall()}
        # "icon" (#69, schema v5) and "email" (#84, schema v6) were both added
        # after this test was originally written for v4.
        assert cols == {"id", "username", "password_hash", "role", "created_at", "icon", "email"}
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
        assert conn.execute("PRAGMA user_version").fetchone()[0] == 6
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

def test_export_includes_profiles(client):
    exp = client.get("/api/export").json()
    assert len(exp["tables"]["profiles"]) == 1
    assert exp["tables"]["profiles"][0]["username"] == "kapekost"

def test_member_export_contains_only_their_own_rows(client, mainmod):
    # The seeded admin logs their own data through `client` first.
    sid = client.post("/api/sessions", json={"workout_day": "upper_a"}).json()["id"]
    client.post(f"/api/sessions/{sid}/sets", json={
        "exercise_id": "bench_press", "exercise_name": "Bench Press",
        "set_number": 1, "reps": 5, "weight_kg": 60})
    client.post("/api/personal-bests", json={
        "exercise_id": "bench_press", "exercise_name": "Bench Press",
        "weight_kg": 100, "reps": 3, "achieved_year": 2023})
    client.post("/api/events", json=[{"name": "admin_event"}])
    client.put("/api/exercises/bench_press/note", json={"note": "admin note"})

    member, member_id = _member_client(mainmod)
    member_sid = member.post("/api/sessions", json={"workout_day": "lower_a"}).json()["id"]
    member.post(f"/api/sessions/{member_sid}/sets", json={
        "exercise_id": "squat", "exercise_name": "Squat",
        "set_number": 1, "reps": 5, "weight_kg": 80})
    member.post("/api/personal-bests", json={
        "exercise_id": "squat", "exercise_name": "Squat",
        "weight_kg": 80, "reps": 5, "achieved_year": 2026})
    member.post("/api/events", json=[{"name": "member_event"}])
    member.put("/api/exercises/squat/note", json={"note": "member note"})

    tables = member.get("/api/export").json()["tables"]

    # profiles is scoped to exactly one row -- their own -- not dropped, so
    # the envelope shape (and the import validation that expects a `profiles`
    # key) stays identical to the admin export's shape.
    assert [r["id"] for r in tables["profiles"]] == [member_id]

    assert len(tables["sessions"]) == 1
    assert tables["sessions"][0]["workout_day"] == "lower_a"
    assert tables["sessions"][0]["profile_id"] == member_id

    # sets has no profile_id of its own -- this is the join-through-sessions
    # scoping (decision #2): only the member's own set comes back, not the
    # admin's bench press set.
    assert len(tables["sets"]) == 1
    assert tables["sets"][0]["exercise_id"] == "squat"

    assert len(tables["personal_bests"]) == 1
    assert tables["personal_bests"][0]["exercise_id"] == "squat"
    assert tables["personal_bests"][0]["profile_id"] == member_id

    assert len(tables["events"]) == 1
    assert tables["events"][0]["name"] == "member_event"
    assert tables["events"][0]["profile_id"] == member_id

    assert len(tables["exercise_notes"]) == 1
    assert tables["exercise_notes"][0]["exercise_id"] == "squat"
    assert tables["exercise_notes"][0]["profile_id"] == member_id

def test_member_export_still_401s_with_no_session(anon_client):
    # Moving /api/export from require_admin to current_profile must not loosen
    # the gate itself -- an anonymous caller still gets nothing.
    r = anon_client.get("/api/export")
    assert r.status_code == 401
    assert r.json() == {"detail": "not authenticated"}

def test_admin_export_unchanged(client, mainmod, seed_profile_id):
    # Existing behaviour, named explicitly as a property of this change rather
    # than incidentally covered by test_export_envelope_shape: an admin's
    # export is still the whole database, every profile's rows included.
    client.post("/api/sessions", json={"workout_day": "upper_a"})
    client.post("/api/personal-bests", json={
        "exercise_id": "bench_press", "exercise_name": "Bench Press",
        "weight_kg": 100, "reps": 3, "achieved_year": 2023})
    client.post("/api/events", json=[{"name": "admin_event"}])

    member, member_id = _member_client(mainmod)
    member.post("/api/sessions", json={"workout_day": "lower_a"})
    member.post("/api/personal-bests", json={
        "exercise_id": "squat", "exercise_name": "Squat",
        "weight_kg": 80, "reps": 5, "achieved_year": 2026})
    member.post("/api/events", json=[{"name": "member_event"}])

    tables = client.get("/api/export").json()["tables"]
    assert {r["id"] for r in tables["profiles"]} == {seed_profile_id, member_id}
    assert {r["profile_id"] for r in tables["sessions"]} == {seed_profile_id, member_id}
    assert {r["profile_id"] for r in tables["personal_bests"]} == {seed_profile_id, member_id}
    assert {r["profile_id"] for r in tables["events"]} == {seed_profile_id, member_id}

def test_old_v3_envelope_without_profiles_still_imports(client):
    # Simulates a backup taken before this feature existed (schema_version 3, no "profiles" key).
    old_envelope = {
        "exported_at": "2026-08-01T00:00:00Z",
        "schema_version": 3,
        "tables": {"sessions": [], "sets": [], "exercise_notes": [], "events": [], "personal_bests": []},
    }
    r = client.post("/api/import", json={"mode": "replace", "confirm": True, "envelope": old_envelope})
    assert r.status_code == 200

def test_old_envelope_does_not_wipe_the_seed_profile(client):
    # A pre-v4 envelope has no "profiles" key at all — it must not empty the live
    # profiles table with nothing to restore it from, or every write breaks
    # afterward (every write endpoint depends on a profile existing).
    old_envelope = {
        "exported_at": "2026-08-01T00:00:00Z",
        "schema_version": 3,
        "tables": {"sessions": [], "sets": [], "exercise_notes": [], "events": [], "personal_bests": []},
    }
    r = client.post("/api/import", json={"mode": "replace", "confirm": True, "envelope": old_envelope})
    assert r.status_code == 200
    exp = client.get("/api/export").json()
    assert len(exp["tables"]["profiles"]) == 1
    assert exp["tables"]["profiles"][0]["username"] == "kapekost"
    # The real regression: writes must still work after the restore.
    assert client.post("/api/sessions", json={"workout_day": "upper_a"}).status_code == 200

def test_old_envelope_with_legacy_notes_and_pbs_backfills_profile_id(client):
    # A real pre-v4 backup can easily contain exercise_notes/personal_bests rows
    # (both pre-existing features) with no profile_id key at all — those two
    # tables were rebuilt with profile_id NOT NULL, so a naive insert 400s the
    # whole import unless the missing profile_id is backfilled on the way in.
    old_envelope = {
        "exported_at": "2026-08-01T00:00:00Z",
        "schema_version": 3,
        "tables": {
            "sessions": [], "sets": [], "events": [],
            "exercise_notes": [{"exercise_id": "bench_press", "note": "go slow",
                                 "updated_at": "2026-08-01 00:00:00"}],
            "personal_bests": [{"id": 1, "exercise_id": "bench_press", "exercise_name": "Bench Press",
                                 "weight_kg": 100.0, "reps": 3, "achieved_year": 2023,
                                 "achieved_note": None, "created_at": "2026-08-01 00:00:00"}],
        },
    }
    r = client.post("/api/import", json={"mode": "replace", "confirm": True, "envelope": old_envelope})
    assert r.status_code == 200
    exp = client.get("/api/export").json()
    assert exp["tables"]["exercise_notes"][0]["profile_id"] is not None
    assert exp["tables"]["personal_bests"][0]["profile_id"] is not None

def test_profiles_round_trip_through_export_import(client, reauthenticate):
    client.post("/api/personal-bests", json={
        "exercise_id": "bench_press", "exercise_name": "Bench Press",
        "weight_kg": 100, "reps": 3, "achieved_year": 2023})
    envelope = client.get("/api/export").json()
    r = client.post("/api/import", json={"mode": "replace", "confirm": True, "envelope": envelope})
    assert r.status_code == 200
    again = reauthenticate(client).get("/api/export").json()
    assert again["tables"]["profiles"] == envelope["tables"]["profiles"]
    assert again["tables"]["personal_bests"] == envelope["tables"]["personal_bests"]

def test_migration_adds_icon_column_seeded_for_admin(mainmod):
    with mainmod.db() as conn:
        assert conn.execute("PRAGMA user_version").fetchone()[0] == 6
        cols = {r[1] for r in conn.execute("PRAGMA table_info(profiles)").fetchall()}
        assert "icon" in cols
        row = conn.execute("SELECT icon FROM profiles WHERE username='kapekost'").fetchone()
        assert row["icon"] == "💪"

def test_icon_migration_does_not_override_an_already_set_icon(mainmod):
    # Simulates a DB where the icon column already exists with real data but
    # user_version hasn't been bumped to 5 yet (e.g. a partially-applied prior
    # migration) -- the v4->v5 block must not clobber it with the default on
    # re-migration. Resetting user_version alone (not also recreating the old
    # table shape) is correct here, unlike the exercise_notes/personal_bests
    # rebuild tests above: this migration only ADDs a column, it never drops
    # the table, so the fixture's already-migrated shape (icon column present)
    # is exactly what "partially migrated" looks like.
    with mainmod.db() as conn:
        conn.execute("PRAGMA user_version = 4")
        conn.execute("UPDATE profiles SET icon = '🔥' WHERE username = 'kapekost'")
        conn.commit()
    mainmod.init()
    with mainmod.db() as conn:
        assert conn.execute("PRAGMA user_version").fetchone()[0] == 6
        assert conn.execute("SELECT icon FROM profiles WHERE username='kapekost'").fetchone()[0] == "🔥"

def test_profile_me_returns_acting_profile_with_icon(client):
    r = client.get("/api/profile/me")
    assert r.status_code == 200
    body = r.json()
    assert body["username"] == "kapekost"
    assert body["role"] == "admin"
    assert body["icon"] == "💪"
