from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional
from contextlib import contextmanager
import sqlite3, os, json
from datetime import datetime

DB_PATH = os.environ.get("DATABASE_URL", "/app/data/workouts.db")

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

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

def _column_exists(conn, table, col):
    return col in [r[1] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()]

def _migrate(conn):
    v = conn.execute("PRAGMA user_version").fetchone()[0]
    # --- v0 -> v1: baseline + ended_at (guarded; existing prod DBs already have it) ---
    if v < 1:
        if not _column_exists(conn, "sessions", "ended_at"):
            conn.execute("ALTER TABLE sessions ADD COLUMN ended_at TEXT")
        conn.execute("PRAGMA user_version = 1")
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

# --- Models ---
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

class EventIn(BaseModel):
    name: str = Field(max_length=64)
    screen: Optional[str] = Field(default=None, max_length=64)
    props: Optional[dict] = None

# --- API Routes ---
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

@app.post("/api/sessions")
def create_session(s: SessionIn):
    with db() as conn:
        cur = conn.execute("INSERT INTO sessions (date, workout_day) VALUES (?, ?)",
                           (datetime.now().strftime("%Y-%m-%d"), s.workout_day))
        conn.commit()
        row = conn.execute("SELECT * FROM sessions WHERE id = ?", (cur.lastrowid,)).fetchone()
        return dict(row)

@app.get("/api/sessions")
def list_sessions():
    with db() as conn:
        rows = conn.execute("SELECT * FROM sessions ORDER BY created_at DESC LIMIT 60").fetchall()
        return [dict(r) for r in rows]

@app.get("/api/sessions/{sid}")
def get_session(sid: int):
    with db() as conn:
        s = conn.execute("SELECT * FROM sessions WHERE id = ?", (sid,)).fetchone()
        if not s:
            raise HTTPException(404)
        sets = conn.execute("SELECT * FROM sets WHERE session_id = ? ORDER BY logged_at", (sid,)).fetchall()
        return {**dict(s), "sets": [dict(x) for x in sets]}

@app.patch("/api/sessions/{sid}")
def patch_session(sid: int, p: SessionPatch):
    with db() as conn:
        if p.completed is not None:
            if p.completed:
                conn.execute(
                    "UPDATE sessions SET completed = 1, "
                    "ended_at = COALESCE(ended_at, datetime('now')) WHERE id = ?",
                    (sid,))
            else:
                conn.execute("UPDATE sessions SET completed = 0 WHERE id = ?", (sid,))
        conn.commit()
        row = conn.execute("SELECT * FROM sessions WHERE id = ?", (sid,)).fetchone()
        return dict(row)

@app.delete("/api/sessions/{sid}")
def delete_session(sid: int):
    with db() as conn:
        conn.execute("DELETE FROM sets WHERE session_id = ?", (sid,))
        conn.execute("DELETE FROM sessions WHERE id = ?", (sid,))
        conn.commit()
        return {"deleted": True}

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

@app.delete("/api/sessions/{sid}/sets/{set_id}")
def delete_set(sid: int, set_id: int):
    with db() as conn:
        conn.execute("DELETE FROM sets WHERE id = ? AND session_id = ?", (set_id, sid))
        conn.commit()
        return {"deleted": True}

@app.get("/api/progress/{exercise_id}")
def get_progress(exercise_id: str):
    with db() as conn:
        rows = conn.execute("""
            SELECT s.date, MAX(st.weight_kg) as max_weight, st.reps as reps
            FROM sets st JOIN sessions s ON st.session_id = s.id
            WHERE st.exercise_id = ?
            GROUP BY s.id, s.date ORDER BY s.date ASC LIMIT 60
        """, (exercise_id,)).fetchall()
        return [dict(r) for r in rows]

@app.get("/api/progress")
def all_progress():
    with db() as conn:
        rows = conn.execute("SELECT DISTINCT exercise_id, exercise_name FROM sets ORDER BY exercise_name").fetchall()
        return [dict(r) for r in rows]

@app.get("/api/notes")
def get_notes():
    with db() as conn:
        rows = conn.execute("SELECT exercise_id, note FROM exercise_notes").fetchall()
        return {r["exercise_id"]: r["note"] for r in rows}

@app.put("/api/exercises/{exercise_id}/note")
def put_note(exercise_id: str, n: NoteIn):
    note = n.note.strip()
    with db() as conn:
        if note:
            conn.execute(
                "INSERT INTO exercise_notes (exercise_id, note, updated_at) VALUES (?,?,datetime('now')) "
                "ON CONFLICT(exercise_id) DO UPDATE SET note=excluded.note, updated_at=datetime('now')",
                (exercise_id, note))
        else:
            conn.execute("DELETE FROM exercise_notes WHERE exercise_id = ?", (exercise_id,))
        conn.commit()
        return {"exercise_id": exercise_id, "note": note}

def epley(weight, reps):
    return round(weight * (1 + reps / 30) * 2) / 2

@app.get("/api/exercises/{exercise_id}/last")
def last_performance(exercise_id: str, exclude_session: int | None = None):
    with db() as conn:
        row = conn.execute(
            "SELECT s.id, s.date FROM sessions s "
            "JOIN sets st ON st.session_id = s.id "
            "WHERE s.completed = 1 AND st.exercise_id = ? AND s.id != ? "
            "ORDER BY s.created_at DESC LIMIT 1",
            (exercise_id, exclude_session if exclude_session is not None else -1)).fetchone()
        if not row:
            return None
        sets = conn.execute(
            "SELECT set_number, weight_kg, reps FROM sets WHERE session_id = ? AND exercise_id = ? ORDER BY set_number",
            (row["id"], exercise_id)).fetchall()
        return {"session_id": row["id"], "date": row["date"], "sets": [dict(s) for s in sets]}

@app.get("/api/sessions/{sid}/prs")
def session_prs(sid: int):
    with db() as conn:
        cur_sets = conn.execute("SELECT exercise_id, exercise_name, weight_kg, reps FROM sets WHERE session_id = ?", (sid,)).fetchall()
        prior = conn.execute(
            "SELECT st.exercise_id, st.weight_kg, st.reps FROM sets st "
            "JOIN sessions s ON s.id = st.session_id WHERE s.completed = 1 AND s.id != ?", (sid,)).fetchall()
        # session volumes for the volume PR
        vol_rows = conn.execute(
            "SELECT st.session_id, SUM(st.weight_kg*st.reps) v FROM sets st "
            "JOIN sessions s ON s.id = st.session_id WHERE s.completed = 1 GROUP BY st.session_id").fetchall()

    prs = []
    by_ex = {}
    for r in cur_sets:
        by_ex.setdefault(r["exercise_id"], {"name": r["exercise_name"], "sets": []})["sets"].append(r)
    for ex_id, info in by_ex.items():
        psets = [p for p in prior if p["exercise_id"] == ex_id]
        cur_w = max(s["weight_kg"] for s in info["sets"])
        if not psets or cur_w > max(p["weight_kg"] for p in psets):
            prs.append({"type": "weight", "exercise_name": info["name"], "value": cur_w, "unit": "kg"})
        # reps at the session's top weight for this exercise
        cur_reps = max(s["reps"] for s in info["sets"] if s["weight_kg"] == cur_w)
        prior_reps_at_w = [p["reps"] for p in psets if p["weight_kg"] == cur_w]
        if not prior_reps_at_w or cur_reps > max(prior_reps_at_w):
            prs.append({"type": "reps", "exercise_name": info["name"], "value": cur_reps, "unit": f"@{cur_w}kg"})
        cur_1rm = max(epley(s["weight_kg"], s["reps"]) for s in info["sets"])
        if not psets or cur_1rm > max(epley(p["weight_kg"], p["reps"]) for p in psets):
            prs.append({"type": "1rm", "exercise_name": info["name"], "value": cur_1rm, "unit": "kg"})

    cur_vol = sum(r["weight_kg"] * r["reps"] for r in cur_sets)
    prior_vols = [row["v"] for row in vol_rows if row["session_id"] != sid]
    if cur_vol and (not prior_vols or cur_vol > max(prior_vols)):
        prs.append({"type": "volume", "exercise_name": None, "value": cur_vol, "unit": "kg"})
    return prs

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

# Serve React — MUST be last
if os.path.exists("static"):
    app.mount("/", StaticFiles(directory="static", html=True), name="static")
