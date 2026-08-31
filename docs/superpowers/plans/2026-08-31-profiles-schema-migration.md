# Profiles: schema migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Issue:** #66 — foundational schema piece for Profiles (#29, closed). Nothing else in the Profiles
family (#67 login, #68 password reset, #69 switcher UI) can start until this lands.

**Goal:** Introduce a real, isolated, data-owning `profiles` table; give every profile-owned table a
`profile_id`; backfill all existing data to one seeded `kapekost` / `role: admin` profile. No
login, no session, no OAuth, no frontend change — purely the data model this issue is scoped to.

**Architecture:** Schema v3 → v4. One new table (`profiles`) plus a `profile_id` column on every
existing profile-owned table. Two of those five tables (`exercise_notes`, `personal_bests`) carry a
uniqueness constraint that must *expand* to include `profile_id` — SQLite cannot `ALTER` a
`PRIMARY KEY` or `UNIQUE` clause in place, so those two need a table rebuild (rename → create →
copy → drop), not a plain `ADD COLUMN`. The other three (`sessions`, `sets`, `events`) have no such
constraint and take a plain `ADD COLUMN`. Every new `profile_id` FK is declared `ON DELETE CASCADE`
and `profiles` is inserted **first** in the `TABLES` list — both required by `/api/import`'s
existing per-table delete-then-insert-immediately loop (see Task 6 for why; get this wrong and
restores break).

Since there is no login yet, every *write* endpoint is updated to attribute new rows to the seeded
profile via a small helper — a deliberate, temporary shim removed when #67 introduces real
request-scoped identity. *Read* endpoints are untouched (still return everything, unscoped) — adding
per-profile filtering without a way to know who's asking would be guessing at auth behavior, which
is explicitly #67's job, not this issue's.

**Tech Stack:** FastAPI + `sqlite3` (backend, Python), pytest (backend tests). No frontend work.

**Spec:** No separate spec doc — direction was resolved via live owner Q&A on #29 (closed). See
`docs/orchestration/DECISIONS.md` → "2026-08-30 — Profiles (#29) shaped" for the full record.

## Global Constraints

- TDD throughout: write the failing test first, watch it fail, then implement.
- No login/session/auth code, no password hashing logic, no OAuth, no new API endpoints, no
  frontend changes — see #67/#68/#69 for those. This issue is schema + the minimal write-path
  change needed to avoid orphaning new rows in the gap before #67 ships.
- `password_hash` is nullable at the schema level and left `NULL` for the seeded profile — per
  #29's constraint, don't assume every profile has a non-null hash forever (future OAuth-only
  profiles won't). #67 must handle a profile whose `password_hash IS NULL` (its own first-login /
  set-a-password flow) — **leave a comment on #67 noting this** as part of Task 8 below.
- Backend: run tests with `.venv/bin/python -m pytest` from `backend/` (see `AGENTS.md` for the
  exact non-interactive path — nothing is on `PATH`).
- This is a schema migration. Per `AGENTS.md`, a pre-deploy `/api/export` snapshot is mandatory and
  a restore drill is required afterward — this is a deploy-time step, not a coding task; see Deploy
  at the end of this plan.

---

### Task 1: `profiles` table + seeded admin — schema migration v4 (part 1)

**Files:**
- Modify: `backend/main.py:42-80` (`_migrate`)
- Test: Create `backend/test_profiles.py`

**Interfaces:**
- Produces: a `profiles` table — `id INTEGER PRIMARY KEY AUTOINCREMENT`, `username TEXT NOT NULL
  UNIQUE`, `password_hash TEXT`, `role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('admin',
  'member'))`, `created_at TEXT NOT NULL DEFAULT (datetime('now'))`. Exactly one row after
  migration: `username='kapekost'`, `role='admin'`, `password_hash=NULL`. `PRAGMA user_version`
  reaches 4 (this task alone doesn't bump it yet — see Task 4; write the table+seed now, wire the
  version bump once all of v3→v4 is in place).

- [ ] **Step 1: Write the failing migration test**

Create `backend/test_profiles.py`:

```python
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
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `cd backend && .venv/bin/python -m pytest test_profiles.py -v`
Expected: FAIL — `sqlite3.OperationalError: no such table: profiles`.

- [ ] **Step 3: Add the profiles table + seed to `_migrate`**

In `backend/main.py`, add a new `if v < 4:` block after the existing `if v < 3:` block
(`backend/main.py:80`), and capture the seed id in a variable usable by later steps in this same
plan:

```python
    # --- v3 -> v4: profiles (real, isolated, data-owning accounts) ---
    if v < 4:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS profiles (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                username      TEXT NOT NULL UNIQUE,
                password_hash TEXT,
                role          TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('admin', 'member')),
                created_at    TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)
        seed = conn.execute("SELECT id FROM profiles WHERE username = 'kapekost'").fetchone()
        seed_id = seed[0] if seed else conn.execute(
            "INSERT INTO profiles (username, role) VALUES ('kapekost', 'admin')").lastrowid
```

(Leave `seed_id` in scope — Tasks 2–4 append to this same `if v < 4:` block and use it for
backfill. The `PRAGMA user_version = 4` line lands at the end of Task 4, once every table in the
block is actually migrated — bumping it early would let a crash mid-block skip the rest on retry.)

- [ ] **Step 4: Run it, confirm it passes**

Run: `cd backend && .venv/bin/python -m pytest test_profiles.py -v`
Expected: PASS (2 tests). `user_version` is still 3 at this point (expected — Task 4 bumps it).

- [ ] **Step 5: Commit**

```bash
git add backend/main.py backend/test_profiles.py
git commit -m "feat(profiles): add profiles table with seeded admin (schema v4, part 1)"
```

---

### Task 2: `profile_id` on `sessions`, `sets`, `events` — plain ADD COLUMN + backfill

**Files:**
- Modify: `backend/main.py` (`_migrate`'s new `if v < 4:` block from Task 1)
- Test: `backend/test_profiles.py`

**Interfaces:**
- Produces: `sessions.profile_id`, `sets.profile_id`, `events.profile_id` — each `INTEGER
  REFERENCES profiles(id) ON DELETE CASCADE`, nullable at the schema level (SQLite can't add a
  `NOT NULL` column with a dynamic default), backfilled to `seed_id` for every existing row. None
  of these three tables has a `UNIQUE`/`PRIMARY KEY` clause that mentions its other columns, so a
  plain `ALTER ADD COLUMN` is safe here — unlike Tasks 3 and 4.

- [ ] **Step 1: Write the failing tests**

Append to `backend/test_profiles.py`:

```python
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
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `cd backend && .venv/bin/python -m pytest test_profiles.py -v`
Expected: FAIL — `no such column: profile_id`.

- [ ] **Step 3: Add columns + backfill inside the `if v < 4:` block**

Append inside the same `if v < 4:` block from Task 1 (after the `seed_id = ...` line):

```python
        for t in ("sessions", "sets", "events"):
            if not _column_exists(conn, t, "profile_id"):
                conn.execute(f"ALTER TABLE {t} ADD COLUMN profile_id INTEGER "
                             f"REFERENCES profiles(id) ON DELETE CASCADE")
            conn.execute(f"UPDATE {t} SET profile_id = ? WHERE profile_id IS NULL", (seed_id,))
```

- [ ] **Step 4: Run it, confirm it passes**

Run: `cd backend && .venv/bin/python -m pytest test_profiles.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/main.py backend/test_profiles.py
git commit -m "feat(profiles): profile_id on sessions/sets/events, backfilled"
```

---

### Task 3: `profile_id` on `exercise_notes` — table rebuild (composite PRIMARY KEY)

**Files:**
- Modify: `backend/main.py` (`_migrate`'s `if v < 4:` block; `put_note`, `backend/main.py:320-332`)
- Test: `backend/test_profiles.py`

**Interfaces:**
- `exercise_notes`'s only key today is `exercise_id TEXT PRIMARY KEY` — one note per exercise,
  period. Once profiles exist, that has to become one note **per profile per exercise**, i.e. a
  composite `PRIMARY KEY (profile_id, exercise_id)`. SQLite has no `ALTER TABLE ... ADD PRIMARY
  KEY`; the only way to change a PK is rename-old → create-new-shape → copy → drop-old.
- Produces: `exercise_notes(profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  exercise_id TEXT NOT NULL, note TEXT NOT NULL, updated_at TEXT DEFAULT (datetime('now')), PRIMARY
  KEY (profile_id, exercise_id))`, with every existing row copied across attributed to `seed_id`.
  `put_note`'s upsert moves from `ON CONFLICT(exercise_id)` to `ON CONFLICT(profile_id,
  exercise_id)` and now writes `profile_id` too (temporary seed-id shim — see Task 5).

- [ ] **Step 1: Write the failing tests**

Append to `backend/test_profiles.py`:

```python
def test_exercise_notes_rebuilt_with_composite_pk(mainmod):
    with mainmod.db() as conn:
        conn.execute("PRAGMA user_version = 3")
        conn.execute("DELETE FROM profiles")
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
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `cd backend && .venv/bin/python -m pytest test_profiles.py -v`
Expected: FAIL — `exercise_notes` still has the old single-column PK / no `profile_id` column.

- [ ] **Step 3: Rebuild `exercise_notes` inside the `if v < 4:` block**

Append inside the same `if v < 4:` block (after Task 2's loop):

```python
        if not _column_exists(conn, "exercise_notes", "profile_id"):
            conn.execute("ALTER TABLE exercise_notes RENAME TO exercise_notes_old")
            conn.execute("""
                CREATE TABLE exercise_notes (
                    profile_id  INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
                    exercise_id TEXT NOT NULL,
                    note        TEXT NOT NULL,
                    updated_at  TEXT DEFAULT (datetime('now')),
                    PRIMARY KEY (profile_id, exercise_id)
                )
            """)
            conn.execute(
                "INSERT INTO exercise_notes (profile_id, exercise_id, note, updated_at) "
                "SELECT ?, exercise_id, note, updated_at FROM exercise_notes_old", (seed_id,))
            conn.execute("DROP TABLE exercise_notes_old")
```

- [ ] **Step 4: Update `put_note`'s upsert**

In `backend/main.py`, replace `put_note` (`backend/main.py:320-332`):

```python
@app.put("/api/exercises/{exercise_id}/note")
def put_note(exercise_id: str, n: NoteIn):
    note = n.note.strip()
    with db() as conn:
        profile_id = _default_profile_id(conn)  # temporary — see Task 5
        if note:
            conn.execute(
                "INSERT INTO exercise_notes (profile_id, exercise_id, note, updated_at) VALUES (?,?,?,datetime('now')) "
                "ON CONFLICT(profile_id, exercise_id) DO UPDATE SET note=excluded.note, updated_at=datetime('now')",
                (profile_id, exercise_id, note))
        else:
            conn.execute("DELETE FROM exercise_notes WHERE profile_id = ? AND exercise_id = ?",
                         (profile_id, exercise_id))
        conn.commit()
        return {"exercise_id": exercise_id, "note": note}
```

(`_default_profile_id` doesn't exist yet — defined in Task 5. If doing Task 3 in isolation, stub it
inline as `_default_profile_id = lambda conn: seed_id`-equivalent, or simply do Tasks 3 and 5
together; the test in this task's Step 1 exercises the real endpoint either way.)

Also update `get_notes` (`backend/main.py:314-318`) — reads stay unscoped per this issue's "no
login logic" boundary, but the query must still work against the new composite-key shape:

```python
@app.get("/api/notes")
def get_notes():
    with db() as conn:
        rows = conn.execute("SELECT exercise_id, note FROM exercise_notes").fetchall()
        return {r["exercise_id"]: r["note"] for r in rows}
```

(No change needed — `SELECT exercise_id, note` doesn't reference the PK shape directly. Listed
here only to confirm it was checked, not skipped.)

- [ ] **Step 5: Run it, confirm it passes**

Run: `cd backend && .venv/bin/python -m pytest test_profiles.py -v`
Expected: PASS.

- [ ] **Step 6: Run the full backend suite to check for regressions**

Run: `cd backend && .venv/bin/python -m pytest -v`
Expected: `test_notes.py`'s existing tests must still pass unscoped (single-profile-in-practice
today, so behavior is externally identical).

- [ ] **Step 7: Commit**

```bash
git add backend/main.py backend/test_profiles.py
git commit -m "feat(profiles): rebuild exercise_notes with composite (profile_id, exercise_id) PK"
```

---

### Task 4: `profile_id` on `personal_bests` — table rebuild (composite UNIQUE) + version bump

**Files:**
- Modify: `backend/main.py` (`_migrate`'s `if v < 4:` block)
- Test: `backend/test_profiles.py`

**Interfaces:**
- `personal_bests` has `UNIQUE(exercise_id, weight_kg, reps, achieved_year)` — without expanding
  this to include `profile_id`, two different profiles logging the identical lift/rep/year combo
  would collide on a false 409. Same rebuild reasoning as Task 3 (SQLite can't `ALTER` a `UNIQUE`
  clause in place).
- Produces: `personal_bests` gains `profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE
  CASCADE`; the unique constraint becomes `UNIQUE(profile_id, exercise_id, weight_kg, reps,
  achieved_year)`. `PRAGMA user_version` reaches 4 (this step's last line — the whole v3→v4 block
  from Tasks 1–4 is now complete).

- [ ] **Step 1: Write the failing tests**

Append to `backend/test_profiles.py`:

```python
def test_personal_bests_rebuilt_with_profile_scoped_unique(mainmod):
    with mainmod.db() as conn:
        conn.execute("PRAGMA user_version = 3")
        conn.execute("DELETE FROM profiles")
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
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `cd backend && .venv/bin/python -m pytest test_profiles.py -v`
Expected: FAIL — no `profile_id` column yet; `user_version` still 3.

- [ ] **Step 3: Rebuild `personal_bests`, then bump the version**

Append inside the same `if v < 4:` block (after Task 3's rebuild), then close the block:

```python
        if not _column_exists(conn, "personal_bests", "profile_id"):
            conn.execute("ALTER TABLE personal_bests RENAME TO personal_bests_old")
            conn.execute("""
                CREATE TABLE personal_bests (
                    id            INTEGER PRIMARY KEY AUTOINCREMENT,
                    profile_id    INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
                    exercise_id   TEXT NOT NULL,
                    exercise_name TEXT NOT NULL,
                    weight_kg     REAL NOT NULL,
                    reps          INTEGER NOT NULL,
                    achieved_year INTEGER NOT NULL,
                    achieved_note TEXT,
                    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
                    UNIQUE(profile_id, exercise_id, weight_kg, reps, achieved_year)
                )
            """)
            conn.execute(
                "INSERT INTO personal_bests (id, profile_id, exercise_id, exercise_name, weight_kg, "
                "reps, achieved_year, achieved_note, created_at) "
                "SELECT id, ?, exercise_id, exercise_name, weight_kg, reps, achieved_year, achieved_note, created_at "
                "FROM personal_bests_old", (seed_id,))
            conn.execute("DROP TABLE personal_bests_old")
        conn.execute("PRAGMA user_version = 4")
```

- [ ] **Step 4: Run it, confirm it passes**

Run: `cd backend && .venv/bin/python -m pytest test_profiles.py -v`
Expected: PASS.

- [ ] **Step 5: Run the full backend suite to check for regressions**

Run: `cd backend && .venv/bin/python -m pytest -v`
Expected: PASS — in particular `test_personal_bests.py`'s existing `test_duplicate_personal_best_is_409`
must still pass (same profile, same lift, still collides — only *cross*-profile collision is fixed).

- [ ] **Step 6: Commit**

```bash
git add backend/main.py backend/test_profiles.py
git commit -m "feat(profiles): rebuild personal_bests with profile-scoped UNIQUE, bump schema to v4"
```

---

### Task 5: Attribute new writes to the seeded profile (temporary, until #67)

**Files:**
- Modify: `backend/main.py` — new helper near `_column_exists` (`backend/main.py:39-40`); call
  sites: `create_session` (`:186-193`), `add_set` (`:235-245`), `create_personal_best`
  (`:254-266`), `ingest_events` (`:440-450`), `put_note` (already updated in Task 3)
- Test: `backend/test_profiles.py`

**Interfaces:**
- Produces: `_default_profile_id(conn)` — returns the seeded `kapekost` profile's id (queried by
  username, not hardcoded as a literal, since nothing guarantees it's row `1` in every environment).
  Every endpoint that inserts a new `sessions`/`sets`/`events`/`personal_bests`/`exercise_notes` row
  now sets `profile_id` to this value. This is a deliberate, temporary shim — without it, every row
  created between this issue shipping and #67 landing would get `profile_id = NULL` (silently
  orphaned, defeating the whole point of the migration). #67 replaces every call site touched here
  with the real logged-in profile's id.

- [ ] **Step 1: Write the failing tests**

Append to `backend/test_profiles.py`:

```python
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
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `cd backend && .venv/bin/python -m pytest test_profiles.py -v`
Expected: FAIL — all four assert `profile_id == seed_id` but get `None`.

- [ ] **Step 3: Add the helper and wire it into every write path**

In `backend/main.py`, add next to `_column_exists` (`backend/main.py:39-40`):

```python
def _default_profile_id(conn):
    # Temporary: attributes every new row to the seeded admin profile until #67
    # introduces real request-scoped login/session identity. Every call site
    # below is removed/replaced in #67, not extended further.
    return conn.execute("SELECT id FROM profiles WHERE username = 'kapekost'").fetchone()[0]
```

`create_session` (`backend/main.py:186-193`):

```python
@app.post("/api/sessions")
def create_session(s: SessionIn):
    with db() as conn:
        profile_id = _default_profile_id(conn)
        cur = conn.execute("INSERT INTO sessions (date, workout_day, profile_id) VALUES (?, ?, ?)",
                           (datetime.now().strftime("%Y-%m-%d"), s.workout_day, profile_id))
        conn.commit()
        row = conn.execute("SELECT * FROM sessions WHERE id = ?", (cur.lastrowid,)).fetchone()
        return dict(row)
```

`add_set` (`backend/main.py:235-245`):

```python
@app.post("/api/sessions/{sid}/sets")
def add_set(sid: int, s: SetIn):
    with db() as conn:
        if not conn.execute("SELECT id FROM sessions WHERE id = ?", (sid,)).fetchone():
            raise HTTPException(404)
        profile_id = _default_profile_id(conn)
        cur = conn.execute(
            "INSERT INTO sets (session_id, exercise_id, exercise_name, set_number, reps, weight_kg, profile_id) "
            "VALUES (?,?,?,?,?,?,?)",
            (sid, s.exercise_id, s.exercise_name, s.set_number, s.reps, s.weight_kg, profile_id))
        conn.commit()
        row = conn.execute("SELECT * FROM sets WHERE id = ?", (cur.lastrowid,)).fetchone()
        return dict(row)
```

`create_personal_best` (`backend/main.py:254-266`):

```python
@app.post("/api/personal-bests")
def create_personal_best(pb: PersonalBestIn):
    with db() as conn:
        profile_id = _default_profile_id(conn)
        try:
            cur = conn.execute(
                "INSERT INTO personal_bests (exercise_id, exercise_name, weight_kg, reps, achieved_year, achieved_note, profile_id) "
                "VALUES (?,?,?,?,?,?,?)",
                (pb.exercise_id, pb.exercise_name, pb.weight_kg, pb.reps, pb.achieved_year, pb.achieved_note, profile_id))
        except sqlite3.IntegrityError:
            raise HTTPException(409, "a personal best with this exercise, weight, reps and year already exists")
        conn.commit()
        row = conn.execute("SELECT * FROM personal_bests WHERE id = ?", (cur.lastrowid,)).fetchone()
        return dict(row)
```

`ingest_events` (`backend/main.py:440-450`):

```python
@app.post("/api/events", status_code=204)
def ingest_events(events: list[EventIn]):
    if len(events) > 100:
        raise HTTPException(422, "too many events in one batch (max 100)")
    if not events:
        return
    with db() as conn:
        profile_id = _default_profile_id(conn)
        conn.executemany(
            "INSERT INTO events (name, screen, props, profile_id) VALUES (?,?,?,?)",
            [(e.name, e.screen, json.dumps(e.props) if e.props is not None else None, profile_id) for e in events])
        conn.commit()
```

- [ ] **Step 4: Run it, confirm it passes**

Run: `cd backend && .venv/bin/python -m pytest test_profiles.py -v`
Expected: PASS.

- [ ] **Step 5: Run the full backend suite to check for regressions**

Run: `cd backend && .venv/bin/python -m pytest -v`
Expected: PASS, no prior test broken.

- [ ] **Step 6: Commit**

```bash
git add backend/main.py backend/test_profiles.py
git commit -m "feat(profiles): attribute new writes to the seed profile until #67 lands"
```

---

### Task 6: Export/import registration — table order and FK-safe restore

**Files:**
- Modify: `backend/main.py:10` (`TABLES`), `:15` (`TABLE_INTRODUCED_AT`)
- Test: `backend/test_profiles.py`, `backend/test_foundations.py`

**Interfaces:**
- `/api/import` (`backend/main.py:473-528`) deletes-then-immediately-reinserts each table in
  `TABLES` order, one table at a time. That interleaving means **parent tables must come before
  their children** in the list: on delete, `sessions`/`sets`/etc. must already be gone (or
  cascade-clearable) before `profiles` is deleted, and on insert, `profiles` rows must already
  exist before `sessions`/`sets`/etc. try to insert a row pointing at them. `profiles` must
  therefore be **first** in `TABLES`, with every dependent's `profile_id` FK declared `ON DELETE
  CASCADE` (already done in Tasks 1–4) so that deleting `profiles` first cascades away its
  dependents automatically, rather than failing the FK check. This exactly mirrors why `sessions`
  already precedes `sets` today (`sets.session_id ... ON DELETE CASCADE`) — same pattern, one level
  up.
- Produces: `TABLES = ["profiles", "sessions", "sets", "exercise_notes", "events",
  "personal_bests"]`, `TABLE_INTRODUCED_AT["profiles"] = 4`. An old envelope (`schema_version <
  4`, no `"profiles"` key) must still import without crashing — restored rows simply end up with
  `profile_id IS NULL` (no profile existed in that old backup to attribute them to; NULL is exempt
  from FK enforcement in SQLite, so this doesn't violate the FK). That's a one-time, expected
  consequence of restoring a pre-#66 backup, not silently broken behavior — worth its own test.

- [ ] **Step 1: Write the failing tests**

Update the existing envelope-shape assertion in `backend/test_foundations.py` (the block described
as `backend/test_foundations.py:82-91` in the personal-bests plan; find it by its `exp["tables"].keys()`
assertion):

```python
    assert set(exp["tables"].keys()) == {"profiles", "sessions", "sets", "exercise_notes", "events", "personal_bests"}
    assert exp["schema_version"] == 4
```

Append to `backend/test_profiles.py`:

```python
def test_export_includes_profiles(client):
    exp = client.get("/api/export").json()
    assert len(exp["tables"]["profiles"]) == 1
    assert exp["tables"]["profiles"][0]["username"] == "kapekost"

def test_old_v3_envelope_without_profiles_still_imports(client):
    # Simulates a backup taken before this feature existed (schema_version 3, no "profiles" key).
    old_envelope = {
        "exported_at": "2026-08-01T00:00:00Z",
        "schema_version": 3,
        "tables": {"sessions": [], "sets": [], "exercise_notes": [], "events": [], "personal_bests": []},
    }
    r = client.post("/api/import", json={"mode": "replace", "confirm": True, "envelope": old_envelope})
    assert r.status_code == 200

def test_profiles_round_trip_through_export_import(client):
    client.post("/api/personal-bests", json={
        "exercise_id": "bench_press", "exercise_name": "Bench Press",
        "weight_kg": 100, "reps": 3, "achieved_year": 2023})
    envelope = client.get("/api/export").json()
    r = client.post("/api/import", json={"mode": "replace", "confirm": True, "envelope": envelope})
    assert r.status_code == 200
    again = client.get("/api/export").json()
    assert again["tables"]["profiles"] == envelope["tables"]["profiles"]
    assert again["tables"]["personal_bests"] == envelope["tables"]["personal_bests"]
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `cd backend && .venv/bin/python -m pytest test_foundations.py test_profiles.py -v`
Expected: FAIL — `"profiles"` missing from `TABLES`; `schema_version` still 3.

- [ ] **Step 3: Register the table, `profiles` first**

In `backend/main.py`:

```python
TABLES = ["profiles", "sessions", "sets", "exercise_notes", "events", "personal_bests"]
```

```python
TABLE_INTRODUCED_AT = {"sessions": 0, "sets": 0, "exercise_notes": 0, "events": 2,
                        "personal_bests": 3, "profiles": 4}
```

- [ ] **Step 4: Run it, confirm it passes**

Run: `cd backend && .venv/bin/python -m pytest test_foundations.py test_profiles.py -v`
Expected: PASS.

- [ ] **Step 5: Run the full backend suite to check for regressions**

Run: `cd backend && .venv/bin/python -m pytest -v`
Expected: PASS, all green.

- [ ] **Step 6: Commit**

```bash
git add backend/main.py backend/test_foundations.py backend/test_profiles.py
git commit -m "feat(profiles): register profiles with export/import, profiles-first table order"
```

---

### Task 7: Full regression pass and #67 hand-off note

**Files:** none changed — verification + a GitHub comment only.

- [ ] **Step 1: Full backend suite**

Run: `cd backend && .venv/bin/python -m pytest -v`
Expected: 100% pass, no skipped/xfail. Record the total test count in the PR description (baseline
was 69 per the #65 tick — expect it to grow by everything added in `test_profiles.py` plus the two
edited assertions in `test_foundations.py`).

- [ ] **Step 2: Sanity-check idempotency end-to-end**

Run a quick manual check (not a pytest case — exercises the whole `init()` path twice against a
throwaway file DB) that a second `init()` on an already-v4 database is a true no-op: no error, no
duplicate seed row, `user_version` still 4. (Covered indirectly by `test_migration_seed_is_idempotent`
in Task 1, but worth a final confirmation once every table in the block is in place together, since
Tasks 1–4 all append to the *same* `if v < 4:` block and a bug in one guard could silently corrupt
another on a second run.)

- [ ] **Step 3: Comment on #67 with the hand-off**

Post a comment on issue #67 (login) noting: the seeded `kapekost` profile has `password_hash =
NULL` by design (see Task 1) — #67's login flow must handle a profile with no password set yet
(first-login / set-a-password path), not assume every profile already has a hash. Also note that
every write endpoint currently hardcodes the seed profile via `_default_profile_id()` (Task 5) —
#67 replaces those call sites with the real logged-in profile's id, it doesn't add a second
mechanism alongside them.

- [ ] **Step 4: Update `AGENTS.md`**

Add a short line to `AGENTS.md`'s schema/version notes (wherever `personal_bests`/schema v3 is
currently documented) recording schema v4: `profiles` table + `profile_id` everywhere else,
seeded `kapekost`/admin. Follow this repo's "Documentation rule" precedent (STATE.md-adjacent, not
this file) — keep it to the same terse style already used for v2/v3.

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md
git commit -m "docs: record schema v4 (profiles) in AGENTS.md"
```

---

## Deploy

This is a schema migration (v3 → v4) — the first one to touch every existing table in the
database, not just add a new one. Per `AGENTS.md`:
1. Take a pre-deploy `/api/export` snapshot before shipping — non-negotiable per this issue's own
   text, more so than any prior migration given the blast radius (every table gets a new column,
   two get rebuilt).
2. Deploy (build on the Mac — never on the Pi; see `AGENTS.md` §Local development for the exact
   non-`PATH` invocations).
3. Run a restore drill afterward (import that snapshot back) to confirm both the migration and the
   import path work against real data — same drill discipline as the last one (2026-07-09).
   Specifically confirm: the restored DB's `profiles` table has exactly the seeded `kapekost` row,
   and every restored `sessions`/`sets`/`exercise_notes`/`events`/`personal_bests` row's
   `profile_id` points at it (a pre-migration export has no `profiles` key, so this exercises the
   old-envelope path from Task 6 for real, not just in a test).
