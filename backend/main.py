from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import sqlite3, os
from datetime import datetime

DB_PATH = os.environ.get("DATABASE_URL", "/app/data/workouts.db")

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

def db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init():
    conn = db()
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
    """)
    conn.commit(); conn.close()

init()

# --- Models ---
class SessionIn(BaseModel):
    workout_day: str

class SetIn(BaseModel):
    exercise_id: str
    exercise_name: str
    set_number: int
    reps: int
    weight_kg: float

class SessionPatch(BaseModel):
    completed: Optional[bool] = None

# --- API Routes ---
@app.get("/api/health")
def health(): return {"status": "ok"}

@app.post("/api/sessions")
def create_session(s: SessionIn):
    conn = db()
    cur = conn.execute("INSERT INTO sessions (date, workout_day) VALUES (?, ?)",
                       (datetime.now().strftime("%Y-%m-%d"), s.workout_day))
    conn.commit()
    row = conn.execute("SELECT * FROM sessions WHERE id = ?", (cur.lastrowid,)).fetchone()
    conn.close(); return dict(row)

@app.get("/api/sessions")
def list_sessions():
    conn = db()
    rows = conn.execute("SELECT * FROM sessions ORDER BY created_at DESC LIMIT 60").fetchall()
    conn.close(); return [dict(r) for r in rows]

@app.get("/api/sessions/{sid}")
def get_session(sid: int):
    conn = db()
    s = conn.execute("SELECT * FROM sessions WHERE id = ?", (sid,)).fetchone()
    if not s: raise HTTPException(404)
    sets = conn.execute("SELECT * FROM sets WHERE session_id = ? ORDER BY logged_at", (sid,)).fetchall()
    conn.close(); return {**dict(s), "sets": [dict(x) for x in sets]}

@app.patch("/api/sessions/{sid}")
def patch_session(sid: int, p: SessionPatch):
    conn = db()
    if p.completed is not None:
        conn.execute("UPDATE sessions SET completed = ? WHERE id = ?", (int(p.completed), sid))
    conn.commit()
    row = conn.execute("SELECT * FROM sessions WHERE id = ?", (sid,)).fetchone()
    conn.close(); return dict(row)

@app.delete("/api/sessions/{sid}")
def delete_session(sid: int):
    conn = db()
    conn.execute("DELETE FROM sets WHERE session_id = ?", (sid,))
    conn.execute("DELETE FROM sessions WHERE id = ?", (sid,))
    conn.commit(); conn.close(); return {"deleted": True}

@app.post("/api/sessions/{sid}/sets")
def add_set(sid: int, s: SetIn):
    conn = db()
    if not conn.execute("SELECT id FROM sessions WHERE id = ?", (sid,)).fetchone():
        raise HTTPException(404)
    cur = conn.execute(
        "INSERT INTO sets (session_id, exercise_id, exercise_name, set_number, reps, weight_kg) VALUES (?,?,?,?,?,?)",
        (sid, s.exercise_id, s.exercise_name, s.set_number, s.reps, s.weight_kg))
    conn.commit()
    row = conn.execute("SELECT * FROM sets WHERE id = ?", (cur.lastrowid,)).fetchone()
    conn.close(); return dict(row)

@app.delete("/api/sessions/{sid}/sets/{set_id}")
def delete_set(sid: int, set_id: int):
    conn = db()
    conn.execute("DELETE FROM sets WHERE id = ? AND session_id = ?", (set_id, sid))
    conn.commit(); conn.close(); return {"deleted": True}

@app.get("/api/progress/{exercise_id}")
def get_progress(exercise_id: str):
    conn = db()
    rows = conn.execute("""
        SELECT s.date, MAX(st.weight_kg) as max_weight, st.reps as reps
        FROM sets st JOIN sessions s ON st.session_id = s.id
        WHERE st.exercise_id = ?
        GROUP BY s.id, s.date ORDER BY s.date ASC LIMIT 60
    """, (exercise_id,)).fetchall()
    conn.close(); return [dict(r) for r in rows]

@app.get("/api/progress")
def all_progress():
    conn = db()
    rows = conn.execute("SELECT DISTINCT exercise_id, exercise_name FROM sets ORDER BY exercise_name").fetchall()
    conn.close(); return [dict(r) for r in rows]

# Serve React — MUST be last
if os.path.exists("static"):
    app.mount("/", StaticFiles(directory="static", html=True), name="static")
