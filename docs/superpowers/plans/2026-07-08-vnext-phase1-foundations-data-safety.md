# v-next Phase 1 — Foundations & Data Safety — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Protect the live SQLite data (hardening + backup/restore), validate all writes, add a versioned additive migration mechanism, and start collecting self-hosted usage analytics — with zero data loss.

**Architecture:** Backend-centric. `backend/main.py` gains a context-manager `db()` with durability/integrity PRAGMAs, a `PRAGMA user_version` migration runner, Pydantic validation, and new endpoints (`/api/events`, `/api/analytics/summary`, `/api/export`, `/api/import`, extended `/api/health`). The frontend gains a fire-and-forget `track()` helper, central screen instrumentation, and a tiny "Export my data" download. A host-side `scripts/backup.sh` does the nightly off-site copy and emits a heartbeat event.

**Tech Stack:** Python 3.11 (prod) / 3.14 (local), FastAPI 0.138.1, pydantic 2.13.4, sqlite3 (stdlib). React 18 + Vite + Tailwind. Tests: pytest 8.2 (`fastapi.testclient`, `httpx`), Vitest.

## Global Constraints

- **App is LIVE — every schema change is additive & idempotent.** New tables, new indexes, new defaulted columns only. Never ALTER/rewrite an existing column or row. Running `init()` on the production DB must preserve every row.
- **Timestamps are UTC** via `datetime('now')` / `datetime.utcnow()`. Do not touch the pre-existing local-time `sessions.date`.
- **1 GB Raspberry Pi, single container, single SQLite file.** No new services, no heavyweight deps. Only stdlib + already-installed libs.
- **Backend serves the built frontend**; the static mount `app.mount("/", ...)` MUST remain the last route in `main.py`.
- **DB path** comes from `os.environ["DATABASE_URL"]` (default `/app/data/workouts.db`). Tests point it at a temp dir via `monkeypatch` + `importlib.reload(main)`.
- **Commit after every task.** Branch off `main` first (`git checkout -b feat/vnext-phase1-foundations`).
- Import is destructive and **agent-only** (no UI). The wipe runs only with `mode="replace"` AND `confirm=true`.

---

## File Structure

- `backend/main.py` — modify: `db()` → contextmanager; `init()` → migration runner; add `Field` validation; add events/analytics/export/import endpoints; extend `/api/health`.
- `backend/test_foundations.py` — create: pytest for hardening, migrations, validation, events, analytics, health, export, import.
- `backend/requirements-dev.txt` — unchanged (httpx/pytest already present).
- `scripts/backup.sh` — create: host cron backup + heartbeat.
- `frontend/src/lib/analytics.js` — create: `track()` / `flush()`.
- `frontend/src/lib/analytics.test.js` — create: Vitest.
- `frontend/src/lib/exportData.js` — create: `downloadExport()`.
- `frontend/src/lib/exportData.test.js` — create: Vitest.
- `frontend/src/components/ScreenTracker.jsx` — create: central `screen_view` / `time_on_screen`.
- `frontend/src/App.jsx` — modify: mount `<ScreenTracker/>`.
- `frontend/src/pages/Workout.jsx`, `components/TimerBar.jsx`, `pages/Exercise.jsx`, `pages/History.jsx` — modify: add specific `track()` calls.
- `frontend/src/pages/Home.jsx` — modify: add "Export my data" link.
- `AGENTS.md` — modify: export/restore runbook + rclone/cron one-time setup + Status update.

---

## Task 1: Harden the DB connection (`db()` contextmanager + PRAGMAs)

**Files:**
- Modify: `backend/main.py` (imports, `db()`, and every call site)
- Test: `backend/test_foundations.py`

**Interfaces:**
- Produces: `db()` is now a `@contextmanager` used as `with db() as conn:`. Callers no longer call `conn.close()`. Every connection has `journal_mode=WAL`, `busy_timeout=5000`, `foreign_keys=ON`.

- [ ] **Step 1: Write the failing test**

Create `backend/test_foundations.py`:

```python
import os, tempfile, importlib
import pytest
from fastapi.testclient import TestClient

@pytest.fixture
def mainmod(monkeypatch):
    tmp = tempfile.mkdtemp()
    monkeypatch.setenv("DATABASE_URL", os.path.join(tmp, "test.db"))
    import main; importlib.reload(main)
    return main

@pytest.fixture
def client(mainmod):
    return TestClient(mainmod.app)

def test_connection_pragmas_are_set(mainmod):
    with mainmod.db() as conn:
        assert conn.execute("PRAGMA journal_mode").fetchone()[0].lower() == "wal"
        assert conn.execute("PRAGMA foreign_keys").fetchone()[0] == 1
        assert conn.execute("PRAGMA busy_timeout").fetchone()[0] == 5000
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest test_foundations.py::test_connection_pragmas_are_set -v`
Expected: FAIL — `db()` is a plain function (a `sqlite3.Connection` has no `__enter__`-as-contextmanager returning our conn) / pragmas unset.

- [ ] **Step 3: Rewrite `db()` and convert call sites**

In `backend/main.py`, update imports (top of file):

```python
from contextlib import contextmanager
import sqlite3, os, json
from datetime import datetime
```

Replace the `db()` function:

```python
@contextmanager
def db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
    finally:
        conn.close()
```

**Mechanical conversion rule — apply to EVERY call site:** replace `conn = db()` with `with db() as conn:` and indent that handler's body one level; delete every `conn.close()`. The call sites (by function) are: `init`, `create_session`, `list_sessions`, `get_session`, `patch_session`, `delete_session`, `add_set`, `delete_set`, `get_progress`, `all_progress`, `get_notes`, `put_note`, `last_performance`, `session_prs`.

The two handlers with early-return leaks MUST end up exactly like this (the `with` guarantees close on the 404 path):

```python
@app.get("/api/sessions/{sid}")
def get_session(sid: int):
    with db() as conn:
        s = conn.execute("SELECT * FROM sessions WHERE id = ?", (sid,)).fetchone()
        if not s:
            raise HTTPException(404)
        sets = conn.execute("SELECT * FROM sets WHERE session_id = ? ORDER BY logged_at", (sid,)).fetchall()
        return {**dict(s), "sets": [dict(x) for x in sets]}

@app.post("/api/sessions/{sid}/sets")
def add_set(sid: int, s: SetIn):
    with db() as conn:
        if not conn.execute("SELECT id FROM sessions WHERE id = ?", (sid,)).fetchone():
            raise HTTPException(404)
        cur = conn.execute(
            "INSERT INTO sets (session_id, exercise_id, exercise_name, set_number, reps, weight_kg) VALUES (?,?,?,?,?,?)",
            (sid, s.exercise_id, s.exercise_name, s.set_number, s.reps, s.weight_kg))
        conn.commit()
        row = conn.execute("SELECT * FROM sets WHERE id = ?", (cur.lastrowid,)).fetchone()
        return dict(row)
```

Convert `init()`'s body the same way (it currently does `conn = db()` … `conn.commit(); conn.close()`) — Task 2 rewrites `init()` fully, so a minimal `with db() as conn:` wrap here is fine.

- [ ] **Step 4: Run the full backend suite to verify it passes and nothing regressed**

Run: `cd backend && python -m pytest -v`
Expected: PASS — new pragma test passes; existing `test_main.py`, `test_history.py`, `test_notes.py` still green.

- [ ] **Step 5: Commit**

```bash
git add backend/main.py backend/test_foundations.py
git commit -m "refactor(backend): contextmanager db() with WAL/busy_timeout/foreign_keys; fix conn leaks"
```

---

## Task 2: Versioned additive migration runner

**Files:**
- Modify: `backend/main.py` (`init()` + helpers)
- Test: `backend/test_foundations.py`

**Interfaces:**
- Produces: `init()` runs ordered migrations keyed on `PRAGMA user_version`. Helper `_column_exists(conn, table, col) -> bool`. After Task 2, `user_version == 1` (baseline + `ended_at`). Later tasks bump it.

- [ ] **Step 1: Write the failing test**

Add to `backend/test_foundations.py`:

```python
def test_init_is_idempotent_and_versioned(mainmod):
    mainmod.init(); mainmod.init()  # second run must not error
    with mainmod.db() as conn:
        v = conn.execute("PRAGMA user_version").fetchone()[0]
        assert v >= 1
        cols = [r[1] for r in conn.execute("PRAGMA table_info(sessions)").fetchall()]
        assert "ended_at" in cols

def test_existing_rows_survive_reinit(client, mainmod):
    sid = client.post("/api/sessions", json={"workout_day": "upper_a"}).json()["id"]
    mainmod.init()  # re-run migrations on a populated DB
    assert client.get(f"/api/sessions/{sid}").json()["id"] == sid
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest test_foundations.py::test_init_is_idempotent_and_versioned -v`
Expected: FAIL — `user_version` is still `0` (never set by the old ad-hoc `init()`).

- [ ] **Step 3: Rewrite `init()` with the migration runner**

Replace the whole `init()` function (and the ad-hoc `ended_at` block) in `backend/main.py`:

```python
def _column_exists(conn, table, col):
    return col in [r[1] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()]

def _migrate(conn):
    v = conn.execute("PRAGMA user_version").fetchone()[0]
    # --- v0 -> v1: baseline + ended_at (guarded; existing prod DBs already have it) ---
    if v < 1:
        if not _column_exists(conn, "sessions", "ended_at"):
            conn.execute("ALTER TABLE sessions ADD COLUMN ended_at TEXT")
        conn.execute("PRAGMA user_version = 1")
    # (v1 -> v2 added in Task 4: events table + indexes)

def init():
    with db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL,
                workout_day TEXT NOT NULL,
                completed INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS sets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL,
                exercise_id TEXT NOT NULL,
                exercise_name TEXT NOT NULL,
                set_number INTEGER NOT NULL,
                reps INTEGER NOT NULL,
                weight_kg REAL NOT NULL,
                logged_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS exercise_notes (
                exercise_id TEXT PRIMARY KEY,
                note TEXT NOT NULL,
                updated_at TEXT DEFAULT (datetime('now'))
            );
        """)
        _migrate(conn)
        conn.commit()

init()
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && python -m pytest test_foundations.py -v`
Expected: PASS — versioned + idempotent; rows survive re-init.

- [ ] **Step 5: Commit**

```bash
git add backend/main.py backend/test_foundations.py
git commit -m "feat(backend): PRAGMA user_version migration runner (additive, idempotent)"
```

---

## Task 3: Input validation on write payloads

**Files:**
- Modify: `backend/main.py` (Pydantic models; add `Field` import)
- Test: `backend/test_foundations.py`

**Interfaces:**
- Produces: `SetIn` rejects `reps < 1`, `weight_kg` outside `[0, 1000]`, `set_number < 1`, over-long strings; `SessionIn`/`NoteIn` cap free-text length. Bad input → `422`.

- [ ] **Step 1: Write the failing test**

Add to `backend/test_foundations.py`:

```python
def test_set_validation_rejects_bad_input(client):
    sid = client.post("/api/sessions", json={"workout_day": "upper_a"}).json()["id"]
    base = {"exercise_id": "bench_press", "exercise_name": "Bench", "set_number": 1}
    assert client.post(f"/api/sessions/{sid}/sets", json={**base, "reps": 0, "weight_kg": 80}).status_code == 422
    assert client.post(f"/api/sessions/{sid}/sets", json={**base, "reps": 8, "weight_kg": -5}).status_code == 422
    assert client.post(f"/api/sessions/{sid}/sets", json={**base, "reps": 8, "weight_kg": 5000}).status_code == 422
    assert client.post(f"/api/sessions/{sid}/sets", json={**base, "reps": 8, "weight_kg": 80}).status_code == 200

def test_session_validation_rejects_long_day(client):
    assert client.post("/api/sessions", json={"workout_day": "x" * 100}).status_code == 422
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest test_foundations.py::test_set_validation_rejects_bad_input -v`
Expected: FAIL — bad payloads currently return `200`.

- [ ] **Step 3: Add `Field` constraints**

In `backend/main.py`, change the import and the models:

```python
from pydantic import BaseModel, Field
```

```python
class SessionIn(BaseModel):
    workout_day: str = Field(max_length=64)

class SetIn(BaseModel):
    exercise_id: str = Field(max_length=64)
    exercise_name: str = Field(max_length=128)
    set_number: int = Field(ge=1)
    reps: int = Field(ge=1)
    weight_kg: float = Field(ge=0, le=1000)

class SessionPatch(BaseModel):
    completed: Optional[bool] = None

class NoteIn(BaseModel):
    note: str = Field(max_length=2000)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && python -m pytest test_foundations.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/main.py backend/test_foundations.py
git commit -m "feat(backend): validate write payloads (reps>=1, 0<=weight<=1000, string caps)"
```

---

## Task 4: Events table + `POST /api/events` + `GET /api/analytics/summary`

**Files:**
- Modify: `backend/main.py` (migration v2, `EventIn`, two endpoints)
- Test: `backend/test_foundations.py`

**Interfaces:**
- Consumes: `_migrate`, `db()`, `json`.
- Produces: `events(id, name, screen, props, ts)` + indexes `events(ts)`, `events(name)`, `sets(session_id)`, `sets(exercise_id)`; `user_version == 2`. `POST /api/events` accepts a JSON array of `{name, screen?, props?}` → `204`. `GET /api/analytics/summary?days=N` → `{days, by_name:[{name,c}], by_screen:[{screen,c}]}`.

- [ ] **Step 1: Write the failing test**

Add to `backend/test_foundations.py`:

```python
def test_events_ingest_and_summary(client):
    r = client.post("/api/events", json=[
        {"name": "screen_view", "screen": "Home"},
        {"name": "screen_view", "screen": "Workout"},
        {"name": "set_logged", "screen": "Workout", "props": {"reps": 8}},
    ])
    assert r.status_code == 204
    summ = client.get("/api/analytics/summary?days=30").json()
    names = {row["name"]: row["c"] for row in summ["by_name"]}
    screens = {row["screen"]: row["c"] for row in summ["by_screen"]}
    assert names["screen_view"] == 2 and names["set_logged"] == 1
    assert screens["Workout"] == 2 and screens["Home"] == 1

def test_events_rejects_malformed_batch(client):
    assert client.post("/api/events", json=[{"screen": "Home"}]).status_code == 422  # missing name

def test_analytics_summary_empty(client):
    summ = client.get("/api/analytics/summary").json()
    assert summ["by_name"] == [] and summ["by_screen"] == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest test_foundations.py::test_events_ingest_and_summary -v`
Expected: FAIL — `/api/events` route does not exist (`404`/`405`).

- [ ] **Step 3: Add the v2 migration and endpoints**

In `_migrate`, append after the `v < 1` block:

```python
    # --- v1 -> v2: usage analytics events + hot-path indexes ---
    if v < 2:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS events (
                id     INTEGER PRIMARY KEY AUTOINCREMENT,
                name   TEXT NOT NULL,
                screen TEXT,
                props  TEXT,
                ts     TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_events_ts   ON events(ts)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_events_name ON events(name)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_sets_session  ON sets(session_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_sets_exercise ON sets(exercise_id)")
        conn.execute("PRAGMA user_version = 2")
```

Add the model near the other models:

```python
class EventIn(BaseModel):
    name: str = Field(max_length=64)
    screen: Optional[str] = Field(default=None, max_length=64)
    props: Optional[dict] = None
```

Add the endpoints (anywhere before the static mount):

```python
@app.post("/api/events", status_code=204)
def ingest_events(events: list[EventIn]):
    if not events:
        return
    with db() as conn:
        conn.executemany(
            "INSERT INTO events (name, screen, props) VALUES (?,?,?)",
            [(e.name, e.screen, json.dumps(e.props) if e.props is not None else None) for e in events])
        conn.commit()

@app.get("/api/analytics/summary")
def analytics_summary(days: int = 30):
    window = f"-{int(days)} days"
    with db() as conn:
        by_name = conn.execute(
            "SELECT name, COUNT(*) c FROM events WHERE ts >= datetime('now', ?) "
            "GROUP BY name ORDER BY c DESC", (window,)).fetchall()
        by_screen = conn.execute(
            "SELECT screen, COUNT(*) c FROM events WHERE ts >= datetime('now', ?) AND screen IS NOT NULL "
            "GROUP BY screen ORDER BY c DESC", (window,)).fetchall()
    return {"days": days, "by_name": [dict(r) for r in by_name], "by_screen": [dict(r) for r in by_screen]}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && python -m pytest test_foundations.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/main.py backend/test_foundations.py
git commit -m "feat(backend): usage-analytics events table, POST /api/events, GET /api/analytics/summary"
```

---

## Task 5: Backup observability on `GET /api/health`

**Files:**
- Modify: `backend/main.py` (`health`)
- Test: `backend/test_foundations.py`

**Interfaces:**
- Consumes: `events` table.
- Produces: `GET /api/health` → `{status:"ok", last_backup_at, last_backup_status}` where status is `"ok"`/`"failed"`/`"none"` from the latest `backup_completed`/`backup_failed` event.

- [ ] **Step 1: Write the failing test**

Add to `backend/test_foundations.py`:

```python
def test_health_reports_no_backup_then_ok(client):
    h = client.get("/api/health").json()
    assert h["status"] == "ok"
    assert h["last_backup_at"] is None and h["last_backup_status"] == "none"

    client.post("/api/events", json=[{"name": "backup_completed", "props": {"bytes": 1024}}])
    h = client.get("/api/health").json()
    assert h["last_backup_status"] == "ok" and h["last_backup_at"] is not None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest test_foundations.py::test_health_reports_no_backup_then_ok -v`
Expected: FAIL — `health()` returns only `{"status": "ok"}`.

- [ ] **Step 3: Extend `health()`**

Replace the `health` function in `backend/main.py`:

```python
@app.get("/api/health")
def health():
    with db() as conn:
        row = conn.execute(
            "SELECT name, ts FROM events WHERE name IN ('backup_completed','backup_failed') "
            "ORDER BY ts DESC, id DESC LIMIT 1").fetchone()
    if row:
        last_at = row["ts"]
        last_status = "ok" if row["name"] == "backup_completed" else "failed"
    else:
        last_at, last_status = None, "none"
    return {"status": "ok", "last_backup_at": last_at, "last_backup_status": last_status}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && python -m pytest test_foundations.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/main.py backend/test_foundations.py
git commit -m "feat(backend): surface last_backup_at/status on GET /api/health"
```

---

## Task 6: `GET /api/export`

**Files:**
- Modify: `backend/main.py` (`TABLES`, `export_data`)
- Test: `backend/test_foundations.py`

**Interfaces:**
- Produces: module-level `TABLES = ["sessions", "sets", "exercise_notes", "events"]`. `GET /api/export` → `{exported_at, schema_version, tables: {<table>: [row,...]}}` (rows are dicts).

- [ ] **Step 1: Write the failing test**

Add to `backend/test_foundations.py`:

```python
def test_export_envelope_shape(client):
    sid = client.post("/api/sessions", json={"workout_day": "upper_a"}).json()["id"]
    client.post(f"/api/sessions/{sid}/sets",
                json={"exercise_id": "bench_press", "exercise_name": "Bench",
                      "set_number": 1, "reps": 8, "weight_kg": 80})
    exp = client.get("/api/export").json()
    assert set(exp["tables"].keys()) == {"sessions", "sets", "exercise_notes", "events"}
    assert exp["schema_version"] == 2
    assert exp["exported_at"].endswith("Z")
    assert len(exp["tables"]["sessions"]) == 1 and len(exp["tables"]["sets"]) == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest test_foundations.py::test_export_envelope_shape -v`
Expected: FAIL — no `/api/export` route.

- [ ] **Step 3: Add `TABLES` and the endpoint**

In `backend/main.py`, add near the top (after `DB_PATH`):

```python
TABLES = ["sessions", "sets", "exercise_notes", "events"]
```

Add the endpoint (before the static mount):

```python
@app.get("/api/export")
def export_data():
    with db() as conn:
        version = conn.execute("PRAGMA user_version").fetchone()[0]
        tables = {t: [dict(r) for r in conn.execute(f"SELECT * FROM {t}").fetchall()] for t in TABLES}
    return {"exported_at": datetime.utcnow().isoformat() + "Z", "schema_version": version, "tables": tables}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && python -m pytest test_foundations.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/main.py backend/test_foundations.py
git commit -m "feat(backend): GET /api/export (consistent JSON snapshot of all tables)"
```

---

## Task 7: `POST /api/import` (safe replace-restore)

**Files:**
- Modify: `backend/main.py` (`ImportIn`, `import_data`)
- Test: `backend/test_foundations.py`

**Interfaces:**
- Consumes: `TABLES`, `db()`, `export_data`'s envelope shape.
- Produces: `POST /api/import` body `{mode:"replace", confirm:true, envelope:<export>}` → `{restored:{<table>:count}}`. Missing `confirm`/`mode` → `400`. Newer `schema_version` or malformed envelope → `400`. Any failure → rollback, `400`. Writes a `pre-import-*.db` snapshot beside the DB before wiping.

- [ ] **Step 1: Write the failing test**

Add to `backend/test_foundations.py`:

```python
def _seed(client):
    sid = client.post("/api/sessions", json={"workout_day": "upper_a"}).json()["id"]
    client.post(f"/api/sessions/{sid}/sets",
                json={"exercise_id": "bench_press", "exercise_name": "Bench",
                      "set_number": 1, "reps": 8, "weight_kg": 80})
    return sid

def test_import_round_trip(client):
    _seed(client)
    envelope = client.get("/api/export").json()
    # wipe by importing an empty-but-valid envelope? No — verify replace restores same data:
    r = client.post("/api/import", json={"mode": "replace", "confirm": True, "envelope": envelope})
    assert r.status_code == 200
    assert r.json()["restored"]["sessions"] == 1 and r.json()["restored"]["sets"] == 1
    again = client.get("/api/export").json()
    assert again["tables"]["sessions"] == envelope["tables"]["sessions"]
    assert again["tables"]["sets"] == envelope["tables"]["sets"]

def test_import_requires_confirm(client):
    _seed(client)
    envelope = client.get("/api/export").json()
    assert client.post("/api/import", json={"mode": "replace", "confirm": False, "envelope": envelope}).status_code == 400
    # data untouched
    assert len(client.get("/api/export").json()["tables"]["sessions"]) == 1

def test_import_rejects_malformed_and_newer_schema(client):
    assert client.post("/api/import", json={"mode": "replace", "confirm": True, "envelope": {"nope": 1}}).status_code == 400
    bad = {"schema_version": 999, "tables": {t: [] for t in ["sessions","sets","exercise_notes","events"]}}
    assert client.post("/api/import", json={"mode": "replace", "confirm": True, "envelope": bad}).status_code == 400
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest test_foundations.py::test_import_round_trip -v`
Expected: FAIL — no `/api/import` route.

- [ ] **Step 3: Add the model and endpoint**

Add the model near the others:

```python
class ImportIn(BaseModel):
    mode: str = "replace"
    confirm: bool = False
    envelope: dict
```

Add the endpoint (before the static mount):

```python
@app.post("/api/import")
def import_data(payload: ImportIn):
    if payload.mode != "replace" or not payload.confirm:
        raise HTTPException(400, "import requires mode='replace' and confirm=true")
    env = payload.envelope
    if not isinstance(env, dict) or "tables" not in env or "schema_version" not in env:
        raise HTTPException(400, "malformed envelope")
    if not isinstance(env["tables"], dict) or any(t not in env["tables"] for t in TABLES):
        raise HTTPException(400, "envelope missing expected tables")
    with db() as conn:
        cur_version = conn.execute("PRAGMA user_version").fetchone()[0]
        if int(env["schema_version"]) > cur_version:
            raise HTTPException(400, "envelope schema_version newer than app")
        # auto-snapshot the live DB before wiping (VACUUM INTO must run outside a txn)
        snap = os.path.join(os.path.dirname(DB_PATH),
                            f"pre-import-{datetime.utcnow():%Y%m%d-%H%M%S}.db")
        conn.execute(f"VACUUM INTO '{snap}'")
        try:
            conn.execute("BEGIN")
            for t in TABLES:
                conn.execute(f"DELETE FROM {t}")
                for r in env["tables"].get(t, []):
                    cols = list(r.keys())
                    placeholders = ",".join("?" * len(cols))
                    conn.execute(f"INSERT INTO {t} ({','.join(cols)}) VALUES ({placeholders})",
                                 [r[c] for c in cols])
            conn.execute(f"PRAGMA user_version = {int(env['schema_version'])}")
            conn.commit()
        except Exception:
            conn.rollback()
            raise HTTPException(400, "import failed; rolled back, live DB unchanged")
    return {"restored": {t: len(env["tables"].get(t, [])) for t in TABLES}}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && python -m pytest test_foundations.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/main.py backend/test_foundations.py
git commit -m "feat(backend): POST /api/import safe replace-restore (auto-snapshot, atomic, guarded)"
```

---

## Task 8: Frontend `track()` analytics helper

**Files:**
- Create: `frontend/src/lib/analytics.js`
- Test: `frontend/src/lib/analytics.test.js`

**Interfaces:**
- Produces: `track(name, props?)` — queues an event with `screen = location.pathname`. `flush(useBeacon=false)` — POSTs the batch to `/api/events`, best-effort (never throws). Auto-flushes on a 5s timer and on `visibilitychange`→hidden / `pagehide`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/analytics.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { track, flush } from './analytics'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true })))
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('analytics', () => {
  it('queues and flushes a batch as one POST', () => {
    track('screen_view', { path: '/' })
    track('set_logged', { reps: 8 })
    flush()
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, opts] = fetch.mock.calls[0]
    expect(url).toBe('/api/events')
    const body = JSON.parse(opts.body)
    expect(body).toHaveLength(2)
    expect(body[0].name).toBe('screen_view')
  })

  it('flush with an empty queue does nothing', () => {
    flush()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('a failing POST does not throw', () => {
    fetch.mockImplementation(() => Promise.reject(new Error('offline')))
    track('x')
    expect(() => flush()).not.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/analytics.test.js`
Expected: FAIL — `./analytics` does not exist.

- [ ] **Step 3: Implement `analytics.js`**

Create `frontend/src/lib/analytics.js`:

```js
let queue = []
let timer = null

export function track(name, props) {
  queue.push({
    name,
    screen: typeof location !== 'undefined' ? location.pathname : null,
    props: props ?? null,
  })
  if (!timer) timer = setTimeout(() => flush(), 5000)
}

export function flush(useBeacon = false) {
  if (timer) { clearTimeout(timer); timer = null }
  if (queue.length === 0) return
  const batch = queue
  queue = []
  const body = JSON.stringify(batch)
  try {
    if (useBeacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon('/api/events', new Blob([body], { type: 'application/json' }))
    } else {
      fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {})
    }
  } catch {
    /* analytics is best-effort — never surface to the UI */
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush(true)
  })
  window.addEventListener('pagehide', () => flush(true))
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/analytics.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/analytics.js frontend/src/lib/analytics.test.js
git commit -m "feat(frontend): fire-and-forget track()/flush() analytics helper"
```

---

## Task 9: Central screen instrumentation + key action events

**Files:**
- Create: `frontend/src/components/ScreenTracker.jsx`
- Test: `frontend/src/components/ScreenTracker.test.jsx`
- Modify: `frontend/src/App.jsx`, `pages/Workout.jsx`, `components/TimerBar.jsx`, `pages/Exercise.jsx`, `pages/History.jsx`

**Interfaces:**
- Consumes: `track` from `../lib/analytics`, `useLocation` from `react-router-dom`.
- Produces: `<ScreenTracker/>` emits `screen_view` on entry and `time_on_screen` on leave. Action call-sites emit `session_start`, `session_finish`, `set_logged`, `rest_skip`, `rest_adjust`, `demo_view`, `cues_open`, `note_edit`, `set_delete`, `session_delete`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/ScreenTracker.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ScreenTracker from './ScreenTracker'

const trackMock = vi.fn()
vi.mock('../lib/analytics', () => ({ track: (...a) => trackMock(...a) }))

beforeEach(() => trackMock.mockClear())

describe('ScreenTracker', () => {
  it('emits screen_view on mount', () => {
    render(<MemoryRouter initialEntries={['/history']}><ScreenTracker /></MemoryRouter>)
    expect(trackMock).toHaveBeenCalledWith('screen_view', { path: '/history' })
  })

  it('emits time_on_screen on unmount', () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={['/history']}><ScreenTracker /></MemoryRouter>)
    trackMock.mockClear()
    unmount()
    expect(trackMock).toHaveBeenCalledWith('time_on_screen', expect.objectContaining({ path: '/history' }))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/ScreenTracker.test.jsx`
Expected: FAIL — `./ScreenTracker` does not exist.

- [ ] **Step 3: Implement `ScreenTracker` and wire the action events**

Create `frontend/src/components/ScreenTracker.jsx`:

```jsx
import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { track } from '../lib/analytics'

export default function ScreenTracker() {
  const { pathname } = useLocation()
  useEffect(() => {
    track('screen_view', { path: pathname })
    const t0 = Date.now()
    return () => track('time_on_screen', { path: pathname, ms: Date.now() - t0 })
  }, [pathname])
  return null
}
```

Mount it in `frontend/src/App.jsx` — add the import and render it inside `<ActiveSessionProvider>` (it needs router context, which `BrowserRouter` provides):

```jsx
import ScreenTracker from './components/ScreenTracker'
```

Place `<ScreenTracker />` as the first child inside `<ActiveSessionProvider>`, before the outer `<div>`.

Add these one-line `track()` calls at their existing action sites (import `track` in each file: `import { track } from '../lib/analytics'`):

- `pages/Home.jsx` — in `startWorkout`, right after `POST /sessions` succeeds: `track('session_start', { day: workoutDay })` (use the day variable in scope).
- `pages/Workout.jsx` — in `logSet` after a successful set POST: `track('set_logged', { exercise_id: ex.id })`; on Finish after the completing PATCH: `track('session_finish', { session_id: sessionId })`; on set delete: `track('set_delete')`.
- `components/TimerBar.jsx` — in the Skip handler: `track('rest_skip')`; in the ±30s handlers: `track('rest_adjust', { delta })`; when the timer reaches 0: `track('rest_actual_vs_target', { target, actual })`.
- `pages/Exercise.jsx` — when the demo becomes visible (in the effect that shows the demo): `track('demo_view', { exercise_id })`; when form cues render/open: `track('cues_open', { exercise_id })`.
- `pages/History.jsx` — on confirmed session delete: `track('session_delete')`.

Keep each call a single best-effort line; do not block or await.

- [ ] **Step 4: Run the frontend suite to verify it passes**

Run: `cd frontend && npm test`
Expected: PASS — `ScreenTracker` tests green; existing tests unaffected.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ScreenTracker.jsx frontend/src/components/ScreenTracker.test.jsx frontend/src/App.jsx frontend/src/pages/Home.jsx frontend/src/pages/Workout.jsx frontend/src/components/TimerBar.jsx frontend/src/pages/Exercise.jsx frontend/src/pages/History.jsx
git commit -m "feat(frontend): screen_view/time_on_screen tracker + key action analytics"
```

---

## Task 10: "Export my data" download link

**Files:**
- Create: `frontend/src/lib/exportData.js`
- Test: `frontend/src/lib/exportData.test.js`
- Modify: `frontend/src/pages/Home.jsx`

**Interfaces:**
- Consumes: `api` from `../api`.
- Produces: `downloadExport()` — fetches `/api/export`, builds a JSON Blob, triggers an `<a download>` named `workout-backup-YYYY-MM-DD.json`. Throws on fetch failure so the caller can toast.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/exportData.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { downloadExport } from './exportData'
import { api } from '../api'

vi.mock('../api', () => ({ api: { get: vi.fn() } }))

beforeEach(() => {
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() })
  const a = { href: '', download: '', click: vi.fn() }
  vi.spyOn(document, 'createElement').mockReturnValue(a)
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('downloadExport', () => {
  it('fetches export and triggers a download', async () => {
    api.get.mockResolvedValue({ exported_at: '2026-07-08T00:00:00Z', tables: {} })
    await downloadExport()
    expect(api.get).toHaveBeenCalledWith('/export')
    expect(document.createElement).toHaveBeenCalledWith('a')
    expect(document.createElement.mock.results[0].value.click).toHaveBeenCalled()
  })

  it('propagates a fetch error to the caller', async () => {
    api.get.mockRejectedValue(new Error('offline'))
    await expect(downloadExport()).rejects.toThrow('offline')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/exportData.test.js`
Expected: FAIL — `./exportData` does not exist.

- [ ] **Step 3: Implement `exportData.js` and add the Home link**

Create `frontend/src/lib/exportData.js`:

```js
import { api } from '../api'

export async function downloadExport() {
  const data = await api.get('/export')
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `workout-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}
```

In `frontend/src/pages/Home.jsx`, add the import and a low-key link at the very bottom of the page (after the `sessions.length === 0` block, still inside the outer container). Reuse the existing `toast` state:

```jsx
import { downloadExport } from '../lib/exportData'
```

```jsx
<button
  onClick={async () => {
    try { await downloadExport() }
    catch { setToast('Export failed — is the backend up?'); setTimeout(() => setToast(null), 2500) }
  }}
  style={{ marginTop: 24, background: 'none', border: 'none', color: '#6b7280',
           fontSize: '0.8rem', textDecoration: 'underline', cursor: 'pointer' }}
>
  Export my data
</button>
```

- [ ] **Step 4: Run the frontend suite to verify it passes**

Run: `cd frontend && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/exportData.js frontend/src/lib/exportData.test.js frontend/src/pages/Home.jsx
git commit -m "feat(frontend): 'Export my data' download link on Home"
```

---

## Task 11: `scripts/backup.sh` + AGENTS.md runbook

**Files:**
- Create: `scripts/backup.sh`
- Modify: `AGENTS.md`

**Interfaces:**
- Produces: a host cron script that VACUUMs the live DB, rclones the copy to Google Drive, prunes old local copies + old `events`, and POSTs a `backup_completed`/`backup_failed` heartbeat to the running app. Not unit-tested (host/cron/rclone); validated manually.

- [ ] **Step 1: Write the script**

Create `scripts/backup.sh`:

```bash
#!/usr/bin/env bash
# Nightly off-site backup for the workout-tracker SQLite DB.
# Runs on the Raspberry Pi HOST via cron (never inside the container).
set -euo pipefail

DB="${DB:-$HOME/workout-tracker/data/workouts.db}"
STAGE="${STAGE:-/tmp}"
REMOTE="${REMOTE:-gdrive:workout-tracker-backups}"
APP="${APP:-http://127.0.0.1:8080}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$STAGE/workout-$STAMP.db"

heartbeat() { # $1 = event name, $2 = json props
  curl -fsS -m 10 -X POST "$APP/api/events" \
    -H 'Content-Type: application/json' \
    -d "[{\"name\":\"$1\",\"props\":$2}]" >/dev/null 2>&1 || true
}

start=$(date +%s)
if sqlite3 "$DB" "VACUUM INTO '$OUT'" \
   && rclone copy "$OUT" "$REMOTE" \
   && sqlite3 "$DB" "DELETE FROM events WHERE ts < datetime('now','-12 months')"; then
  bytes=$(stat -c%s "$OUT" 2>/dev/null || echo 0)
  dur=$(( $(date +%s) - start ))
  heartbeat backup_completed "{\"bytes\":$bytes,\"remote\":\"$REMOTE\",\"duration_s\":$dur}"
else
  heartbeat backup_failed "{\"error\":\"backup.sh failed\"}"
  find "$STAGE" -name 'workout-*.db' -mtime +14 -delete 2>/dev/null || true
  exit 1
fi

find "$STAGE" -name 'workout-*.db' -mtime +14 -delete 2>/dev/null || true
```

Make it executable:

```bash
chmod +x scripts/backup.sh
```

- [ ] **Step 2: Add the runbook to AGENTS.md**

In `AGENTS.md`, under the "Data persistence & backup" section, add:

```markdown
### Backup / restore (Phase 1)

- **On-demand snapshot (agent):** `GET /api/export` returns a full JSON snapshot.
  Before ANY schema-changing deploy, save one as a pre-deploy safety copy:
  `curl -s http://192.168.1.170:8080/api/export > pre-deploy-$(date +%F).json`.
- **Restore (agent, destructive):** `POST /api/import` with
  `{"mode":"replace","confirm":true,"envelope":<export-json>}`. It auto-snapshots
  the live DB to `data/pre-import-*.db` first and is atomic (rolls back on error).
  Without `confirm:true` it is a no-op `400`.
- **Manual file restore:** stop the container, drop a backup `.db` into
  `data/workouts.db`, restart.

### Nightly off-site backup — one-time Pi host setup

1. `sudo apt-get install -y rclone sqlite3` (or `rclone` static binary).
2. `rclone config` → new remote named `gdrive` (Google Drive), authorise once.
3. Test: `bash ~/workout-tracker/scripts/backup.sh` → check the file appears in
   Drive and `GET /api/health` shows a recent `last_backup_at`.
4. Cron (host, not container): `crontab -e` →
   `30 3 * * * /bin/bash $HOME/workout-tracker/scripts/backup.sh >> $HOME/backup.log 2>&1`

Verify health: `curl -s http://192.168.1.170:8080/api/health` →
`{"status":"ok","last_backup_at":"…","last_backup_status":"ok"}`.
```

- [ ] **Step 3: Commit**

```bash
git add scripts/backup.sh AGENTS.md
git commit -m "feat(ops): nightly backup.sh (VACUUM->rclone->heartbeat) + backup/restore runbook"
```

---

## Task 12: Phase-end gate — full suite, review, progress report

**Files:**
- Modify: `AGENTS.md` (Status)

- [ ] **Step 1: Run the full backend + frontend suites**

Run: `cd backend && python -m pytest -v && cd ../frontend && npm test`
Expected: ALL PASS.

- [ ] **Step 2: Code review**

Run `/code-review` on the branch diff. Address any correctness findings; re-run the suites after fixes.

- [ ] **Step 3: Append a progress report to AGENTS.md Status**

Add a "Done" entry summarising Phase 1 (hardening, migrations, validation, analytics, export/import, backup, health) with the commit range, and note the one-time rclone/cron setup as the remaining manual step. Update `_Last updated:_`.

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md
git commit -m "docs: AGENTS.md status — v-next Phase 1 complete"
```

- [ ] **Step 5: Deploy & verify (per AGENTS.md runbook)**

Build (Mac, arm64) → transfer to Pi → `docker compose up -d` → verify `/api/health` ok, bundle hash matches, Home Assistant still healthy. Run the one-time rclone/cron setup and confirm the first backup lands in Drive and `last_backup_status` becomes `"ok"`.

---

## Self-Review

**Spec coverage:**
- A2 DB hardening → Task 1. A4 migrations → Task 2. A3 validation → Task 3.
- B7 analytics: events table/ingest/summary → Task 4; `track()` helper → Task 8; instrumentation (screens + actions + timings) → Task 9.
- A1 backup: export → Task 6; import → Task 7; backup.sh + heartbeat + runbook → Task 11; health surfacing → Task 5; tiny UI download → Task 10.
- Bonus indexes (`sets(session_id/exercise_id)`) → folded into Task 4's v2 migration.
- Deploy gate / progress report → Task 12.
- Timings (`time_on_screen`, `rest_actual_vs_target`) → Task 9. All spec sections map to a task.

**Placeholder scan:** No TBD/TODO; every code step shows real code and exact commands.

**Type consistency:** `db()` contextmanager used consistently from Task 1 on; `TABLES` defined in Task 6 and reused in Task 7; `track(name, props)` / `flush(useBeacon)` signatures match between Tasks 8 and 9; `events` columns (`name, screen, props, ts`) consistent across Tasks 4/5/6/11; envelope keys (`exported_at, schema_version, tables`) consistent across Tasks 6/7/11.

**Note for the implementer:** Tasks 1–7 all edit `backend/main.py` in sequence — execute them in order; each builds on the previous file state. The static mount `app.mount("/", …)` must remain the last statement in the file throughout.
