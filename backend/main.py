from fastapi import FastAPI, HTTPException, Response, Request, Depends
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator
from typing import Literal, Optional
from contextlib import contextmanager
import sqlite3, os, json, glob, secrets
import bcrypt
from datetime import datetime, timezone

DB_PATH = os.environ.get("DATABASE_URL", "/app/data/workouts.db")
TABLES = ["profiles", "sessions", "sets", "exercise_notes", "events", "personal_bests"]
# schema_version at which each table was introduced (see _migrate). An
# envelope only needs to contain the tables that existed at its own
# schema_version — a table a later migration adds must not make older
# backups un-importable.
TABLE_INTRODUCED_AT = {"sessions": 0, "sets": 0, "exercise_notes": 0, "events": 2,
                        "personal_bests": 3, "profiles": 4}
PRE_IMPORT_SNAPSHOTS_KEPT = 3
# scripts/backup.sh writes this next to the DB, in the volume the app already
# mounts. It replaced an /api/events POST in #88: the status no longer lives
# inside the database being backed up (a restore used to drag stale heartbeats
# back in with it), and there is no unauthenticated write endpoint to fence.
BACKUP_STATUS_PATH = os.path.join(os.path.dirname(DB_PATH), "backup-status.json")
# Backups are manual (the cron was removed 2026-09-04), so this is a "it has
# been a while" nudge rather than a missed-schedule alarm: an ok older than 8
# days reads stale, and scripts/deploy.sh warns rather than failing on it. The
# reason to keep the window generous is 2026-09-01..03, when three nights of
# failed off-site backups went unnoticed — the lesson being that a signal which
# is always red stops being read. If a schedule ever comes back, this threshold
# moves with it rather than staying put.
BACKUP_STALE_AFTER_S = 8 * 24 * 3600
# Git short SHA baked in at image build (--build-arg APP_COMMIT=...); "dev"
# outside Docker. Surfaced in /api/health so a deploy is verifiable at a glance.
APP_VERSION = os.environ.get("APP_COMMIT", "dev")

# No CORS middleware on purpose: prod serves the frontend same-origin and dev
# uses the Vite proxy, so any cross-origin browser request is a foreign page
# trying to read /api/export or fire /api/import — let the preflight fail.
app = FastAPI()

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

def _default_profile_id(conn):
    # Temporary: attributes every new row to the seeded admin profile until #67
    # introduces real request-scoped login/session identity. Every call site
    # below is removed/replaced in #67, not extended further.
    return conn.execute("SELECT id FROM profiles WHERE username = 'kapekost'").fetchone()[0]

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
    # --- v2 -> v3: manual historical Personal Bests ---
    if v < 3:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS personal_bests (
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
        conn.execute("PRAGMA user_version = 3")
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
        for t in ("sessions", "sets", "events"):
            if not _column_exists(conn, t, "profile_id"):
                conn.execute(f"ALTER TABLE {t} ADD COLUMN profile_id INTEGER "
                             f"REFERENCES profiles(id) ON DELETE CASCADE")
            conn.execute(f"UPDATE {t} SET profile_id = ? WHERE profile_id IS NULL", (seed_id,))
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
    # --- v4 -> v5: profile icon (TopBar display, #69) ---
    if v < 5:
        if not _column_exists(conn, "profiles", "icon"):
            conn.execute("ALTER TABLE profiles ADD COLUMN icon TEXT")
        conn.execute("UPDATE profiles SET icon = '💪' WHERE username = 'kapekost' AND icon IS NULL")
        conn.execute("PRAGMA user_version = 5")
    # --- v5 -> v6: accounts (#84) — email, invite/reset tokens, server-side sessions ---
    if v < 6:
        if not _column_exists(conn, "profiles", "email"):
            conn.execute("ALTER TABLE profiles ADD COLUMN email TEXT")
        # A partial unique index, not a UNIQUE column: several profiles may sit
        # at NULL email ("not yet invited") without colliding with each other.
        conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email "
                     "ON profiles(email) WHERE email IS NOT NULL")
        # Created here, but not minted until #85 (invite/reset). Only the
        # SHA-256 of a token is ever stored, so a leaked database — or a leaked
        # backup — cannot be replayed into account access.
        conn.execute("""
            CREATE TABLE IF NOT EXISTS auth_tokens (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
                token_hash TEXT NOT NULL UNIQUE,
                kind       TEXT NOT NULL CHECK(kind IN ('invite', 'reset')),
                expires_at TEXT NOT NULL,
                used_at    TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_auth_tokens_profile ON auth_tokens(profile_id)")
        # Named auth_sessions to avoid colliding with the workout `sessions`
        # table. Neither this nor auth_tokens joins TABLES/TABLE_INTRODUCED_AT:
        # restoring a backup must never resurrect a live session or an unused
        # invite, and a backup should not be a store of credential material.
        conn.execute("""
            CREATE TABLE IF NOT EXISTS auth_sessions (
                id         TEXT PRIMARY KEY,
                profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_auth_sessions_profile ON auth_sessions(profile_id)")
        conn.execute("PRAGMA user_version = 6")

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
    # Must match the PLAN/CYCLE keys in frontend/src/data/workoutPlan.js —
    # adding or renaming a day there requires updating this Literal in the
    # same deploy, or Start Workout 422s.
    workout_day: Literal["upper_a", "lower_a", "upper_b", "lower_b"]

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

class ImportIn(BaseModel):
    mode: str = "replace"
    confirm: bool = False
    envelope: dict

class PersonalBestIn(BaseModel):
    exercise_id: str = Field(max_length=64)
    exercise_name: str = Field(max_length=128)
    weight_kg: float = Field(ge=0, le=1000)
    reps: int = Field(ge=1, le=100)
    achieved_year: int = Field(ge=1900)
    achieved_note: Optional[str] = Field(default=None, max_length=200)

    @field_validator("achieved_year")
    @classmethod
    def year_not_in_future(cls, v):
        if v > datetime.now().year:
            raise ValueError("achieved_year cannot be in the future")
        return v

def _leg(raw, allowed):
    """(at, status) for one leg of the backup chain, or (None, None) if there
    is nothing reportable there. Never raises.

    A leg we cannot read is not the same as a leg that failed, so an absent,
    misshapen or unparseable one reports nothing at all rather than inventing
    a status for it.
    """
    if not isinstance(raw, dict):
        return None, None
    at, status = raw.get("at"), raw.get("status")
    if not isinstance(at, str) or status not in allowed:
        return None, None
    if status == "ok":
        # Only an "ok" ages into "stale". A "failed" is already red, and a
        # "skipped" leg never ran; relabelling either would drop the one
        # detail that separates them from a backup that simply got old.
        try:
            # fromisoformat handles the trailing Z on 3.11+ (this runs on 3.14),
            # but a hand-edited or naive timestamp still has to not 500 us.
            age = (datetime.now(timezone.utc)
                   - datetime.fromisoformat(at)).total_seconds()
            if age > BACKUP_STALE_AFTER_S:
                status = "stale"
        except (ValueError, TypeError):
            pass  # keep the reported status, skip the staleness comparison
    return at, status

def _last_backup():
    """Read both backup legs out of backup-status.json. Never raises.

    Returns (local_at, local_status, remote_at, remote_status). The two legs
    are reported independently because they fail independently (#93): the
    snapshot lands on the host's disk before rclone ever runs, so a Drive
    outage leaves a perfectly good local copy behind. Reporting that as one
    failed backup is what taught us to stop reading the signal — four such
    nights in a row, 2026-09-01..04. `local` stays the headline status: it is
    the leg standing between us and data loss, and scripts/deploy.sh reads it.

    /api/health is the thing that tells us the backup chain is alive, so it
    must not become the thing that breaks: an absent file, a write cut short,
    missing keys or a timestamp nothing can parse all degrade to a report.
    """
    try:
        with open(BACKUP_STATUS_PATH) as f:
            data = json.load(f)
        if not isinstance(data, dict):
            raise ValueError("backup-status.json is not an object")
    except (OSError, ValueError):
        return None, "none", None, None
    if "local" in data:
        local = _leg(data.get("local"), ("ok", "failed"))
        remote = _leg(data.get("remote"), ("ok", "failed", "skipped"))
    else:
        # A pre-#93 file, still on the Pi until the next backup runs there.
        # Its top-level "remote" is the remote's *name*, not a leg, so the
        # off-site status is genuinely unknown rather than absent.
        local, remote = _leg(data, ("ok", "failed")), (None, None)
    return local[0], local[1] or "none", remote[0], remote[1]

# --- Auth (#84) ---
# Deliberately unwired from the data endpoints: #86 flips the gate and deletes
# _default_profile_id. Keeping it in one block means #85 can lift the whole
# section into its own module if it outgrows main.py — note that doing so also
# needs a Dockerfile change, since it COPYs backend/main.py by name.

# Cost 12 = 627 ms on the deploy target (Pi 3 B+, aarch64), measured, not
# assumed. bcrypt rather than a memory-hard KDF because each concurrent
# scrypt/argon2 hash reserves its full working set, and a handful of parallel
# logins could OOM a container on a box with ~185 MiB free running Home
# Assistant beside it. See the design doc before changing either fact.
BCRYPT_ROUNDS = 12
PASSWORD_MIN_LEN = 12
# bcrypt's own input limit. bcrypt >= 4.2 raises rather than silently
# truncating, but validating first turns that into a clear 400, not a 500.
PASSWORD_MAX_BYTES = 72

def validate_password(password: str) -> None:
    if len(password) < PASSWORD_MIN_LEN:
        raise ValueError(f"password must be at least {PASSWORD_MIN_LEN} characters")
    if len(password.encode("utf-8")) > PASSWORD_MAX_BYTES:
        raise ValueError(f"password must be at most {PASSWORD_MAX_BYTES} bytes")

def hash_password(password: str) -> str:
    validate_password(password)
    return bcrypt.hashpw(password.encode("utf-8"),
                         bcrypt.gensalt(rounds=BCRYPT_ROUNDS)).decode("ascii")

def verify_password(password: str, password_hash: str | None) -> bool:
    # A NULL hash means "invited, never set a password" and must never
    # authenticate. A malformed hash returns False rather than raising, so a
    # corrupt row is a failed login rather than a 500 on the login path.
    if not password_hash:
        return False
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("ascii"))
    except ValueError:
        return False

SESSION_COOKIE = "wt_session"
SESSION_TTL_DAYS = 30           # a phone-first app opened a few times a week
# Off for the current plain-HTTP tailnet URL; flipped to 1 once #27's tunnel
# terminates TLS. Shipping Secure before HTTPS exists silently breaks login.
APP_COOKIE_SECURE = os.environ.get("APP_COOKIE_SECURE", "0") == "1"

def issue_session(conn, profile_id: int) -> str:
    """Insert a session row and return its opaque id. Does not commit."""
    session_id = secrets.token_urlsafe(32)
    # Expiry is computed by SQLite so it shares one format with every other
    # timestamp in the schema and string comparison stays well-defined.
    conn.execute("INSERT INTO auth_sessions (id, profile_id, expires_at) "
                 f"VALUES (?, ?, datetime('now', '+{SESSION_TTL_DAYS} days'))",
                 (session_id, profile_id))
    return session_id

def session_profile(conn, session_id):
    """The profile behind a live session, or None. Expired rows are deleted on
    the way past — opportunistic cleanup, no reaper process."""
    if not session_id:
        return None
    row = conn.execute(
        "SELECT profile_id, expires_at <= datetime('now') AS expired "
        "FROM auth_sessions WHERE id = ?", (session_id,)).fetchone()
    if row is None:
        return None
    if row["expired"]:
        conn.execute("DELETE FROM auth_sessions WHERE id = ?", (session_id,))
        conn.commit()
        return None
    return conn.execute(
        "SELECT id, username, role, icon, email FROM profiles WHERE id = ?",
        (row["profile_id"],)).fetchone()

def revoke_sessions(conn, profile_id: int) -> None:
    """Kill every session for a profile. Does not commit.

    This is why sessions are server-side rows rather than a signed stateless
    cookie: #85's password reset must be able to end sessions that already
    exist, which a self-contained token cannot do before it expires.
    """
    conn.execute("DELETE FROM auth_sessions WHERE profile_id = ?", (profile_id,))

def set_session_cookie(response: Response, session_id: str) -> None:
    response.set_cookie(SESSION_COOKIE, session_id, max_age=SESSION_TTL_DAYS * 86400,
                        httponly=True, samesite="lax", secure=APP_COOKIE_SECURE, path="/")

def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/")

# --- API Routes ---
@app.api_route("/api/health", methods=["GET", "HEAD"])
def health(response: Response):
    response.headers["Cache-Control"] = "no-store"
    # Touch the database on purpose. Until #88 this endpoint read the backup
    # status out of the events table, so an unopenable DB failed the request as
    # a side effect — and scripts/deploy.sh has always leaned on that, reading
    # anything other than a 200 as "the deploy is not up". Now that the status
    # comes from a file, nothing else here opens the DB, and without this
    # /api/health would cheerfully report ok for an app whose database is gone.
    with db() as conn:
        conn.execute("SELECT 1")
    last_at, last_status, remote_at, remote_status = _last_backup()
    return {"status": "ok", "version": APP_VERSION,
            "last_backup_at": last_at, "last_backup_status": last_status,
            "last_backup_remote_at": remote_at,
            "last_backup_remote_status": remote_status}

@app.get("/api/profile/me")
def get_current_profile():
    # Temporary, like _default_profile_id: "the acting profile" is the seed
    # admin until #67 introduces real login. Replaced there, not extended.
    with db() as conn:
        profile_id = _default_profile_id(conn)
        row = conn.execute(
            "SELECT id, username, role, icon FROM profiles WHERE id = ?", (profile_id,)).fetchone()
        return dict(row)

@app.post("/api/sessions")
def create_session(s: SessionIn):
    with db() as conn:
        profile_id = _default_profile_id(conn)
        cur = conn.execute("INSERT INTO sessions (date, workout_day, profile_id) VALUES (?, ?, ?)",
                           (datetime.now().strftime("%Y-%m-%d"), s.workout_day, profile_id))
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
        if not row:
            raise HTTPException(404)
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
        profile_id = _default_profile_id(conn)
        cur = conn.execute(
            "INSERT INTO sets (session_id, exercise_id, exercise_name, set_number, reps, weight_kg, profile_id) "
            "VALUES (?,?,?,?,?,?,?)",
            (sid, s.exercise_id, s.exercise_name, s.set_number, s.reps, s.weight_kg, profile_id))
        conn.commit()
        row = conn.execute("SELECT * FROM sets WHERE id = ?", (cur.lastrowid,)).fetchone()
        return dict(row)

@app.delete("/api/sessions/{sid}/sets/{set_id}")
def delete_set(sid: int, set_id: int):
    with db() as conn:
        conn.execute("DELETE FROM sets WHERE id = ? AND session_id = ?", (set_id, sid))
        conn.commit()
        return {"deleted": True}

@app.post("/api/personal-bests")
def create_personal_best(pb: PersonalBestIn):
    with db() as conn:
        profile_id = _default_profile_id(conn)  # temporary — see Task 5
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

@app.get("/api/personal-bests")
def list_personal_bests():
    with db() as conn:
        rows = conn.execute(
            "SELECT * FROM personal_bests ORDER BY exercise_name, weight_kg DESC").fetchall()
        return [dict(r) for r in rows]

@app.delete("/api/personal-bests/{pb_id}")
def delete_personal_best(pb_id: int):
    with db() as conn:
        conn.execute("DELETE FROM personal_bests WHERE id = ?", (pb_id,))
        conn.commit()
        return {"deleted": True}

@app.get("/api/progress/{exercise_id}")
def get_progress(exercise_id: str):
    # Completed sessions only (in-progress/abandoned sets would skew the chart
    # and the PR baseline), keeping the most recent 60, re-sorted for the chart.
    with db() as conn:
        rows = conn.execute("""
            SELECT date, max_weight, reps FROM (
                SELECT s.date as date, MAX(st.weight_kg) as max_weight,
                       st.reps as reps, s.id as sid
                FROM sets st JOIN sessions s ON st.session_id = s.id
                WHERE st.exercise_id = ? AND s.completed = 1
                GROUP BY s.id, s.date
                ORDER BY s.date DESC, s.id DESC LIMIT 60
            ) ORDER BY date ASC, sid ASC
        """, (exercise_id,)).fetchall()
        return [dict(r) for r in rows]

@app.get("/api/progress")
def all_progress():
    # Completed sessions only, mirroring get_progress — otherwise the Progress
    # page lists picker chips whose charts are permanently empty. max_weight
    # lets the workout page build its PR baseline from this one call instead
    # of one request per exercise.
    with db() as conn:
        rows = conn.execute("""
            SELECT st.exercise_id, st.exercise_name, MAX(st.weight_kg) as max_weight
            FROM sets st JOIN sessions s ON st.session_id = s.id
            WHERE s.completed = 1
            GROUP BY st.exercise_id, st.exercise_name ORDER BY st.exercise_name
        """).fetchall()
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

@app.get("/api/exercises/recency")
def exercises_recency():
    # Powers the Home muscle-group picker: for each exercise, when it was last
    # trained, how much of it, and when it was trained before that.
    #
    # Completed sessions only, matching get_progress/all_progress. The cost is
    # that sets logged in an abandoned session don't count toward the recovery
    # estimate — it reads that muscle as fresher than it is. Same direction of
    # error as the unlogged-classes blind spot, and accepted for consistency.
    #
    # One query, not 22: /api/exercises/{id}/last is per-exercise and a Pi 3 B+
    # over gym wifi cannot serve a 22-request fan-out on page load.
    #
    # last_date comes from sessions.date (server-LOCAL, for calendar day counts)
    # while last_at comes from sets.logged_at (UTC, for hour counts). They are
    # deliberately different clocks — see the design doc.
    with db() as conn:
        rows = conn.execute("""
            WITH per_session AS (
                SELECT st.exercise_id            AS exercise_id,
                       s.id                      AS session_id,
                       s.date                    AS date,
                       MAX(st.logged_at)         AS last_at,
                       COUNT(*)                  AS sets,
                       SUM(st.weight_kg * st.reps) AS volume_kg,
                       ROW_NUMBER() OVER (
                           PARTITION BY st.exercise_id
                           ORDER BY s.date DESC, s.id DESC
                       ) AS rn
                FROM sets st
                JOIN sessions s ON s.id = st.session_id
                WHERE s.completed = 1
                GROUP BY st.exercise_id, s.id, s.date
            )
            SELECT cur.exercise_id, cur.date AS last_date, cur.last_at,
                   cur.sets, cur.volume_kg, prev.date AS prev_date
            FROM per_session cur
            LEFT JOIN per_session prev
                   ON prev.exercise_id = cur.exercise_id AND prev.rn = 2
            WHERE cur.rn = 1
            ORDER BY cur.exercise_id
        """).fetchall()
        return [dict(r) for r in rows]

@app.get("/api/sessions/{sid}/prs")
def session_prs(sid: int):
    with db() as conn:
        cur_sets = conn.execute("SELECT exercise_id, exercise_name, weight_kg, reps FROM sets WHERE session_id = ?", (sid,)).fetchall()
        prior = conn.execute(
            "SELECT st.exercise_id, st.weight_kg, st.reps FROM sets st "
            "JOIN sessions s ON s.id = st.session_id WHERE s.completed = 1 AND s.id != ?", (sid,)).fetchall()
        pb_rows = conn.execute(
            "SELECT exercise_id, weight_kg, reps FROM personal_bests").fetchall()
        prior = list(prior) + list(pb_rows)
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
        # No prior completed history for this exercise → baseline, not a PR.
        if not psets:
            prs.append({"type": "baseline", "exercise_name": info["name"], "value": None, "unit": None})
            continue
        cur_w = max(s["weight_kg"] for s in info["sets"])
        if cur_w > max(p["weight_kg"] for p in psets):
            prs.append({"type": "weight", "exercise_name": info["name"], "value": cur_w, "unit": "kg"})
        # reps at the session's top weight — only a PR if we've lifted this weight before
        cur_reps = max(s["reps"] for s in info["sets"] if s["weight_kg"] == cur_w)
        prior_reps_at_w = [p["reps"] for p in psets if p["weight_kg"] == cur_w]
        if prior_reps_at_w and cur_reps > max(prior_reps_at_w):
            prs.append({"type": "reps", "exercise_name": info["name"], "value": cur_reps, "unit": f"@{cur_w}kg"})
        cur_1rm = max(epley(s["weight_kg"], s["reps"]) for s in info["sets"])
        if cur_1rm > max(epley(p["weight_kg"], p["reps"]) for p in psets):
            prs.append({"type": "1rm", "exercise_name": info["name"], "value": cur_1rm, "unit": "kg"})

    cur_vol = sum(r["weight_kg"] * r["reps"] for r in cur_sets)
    prior_vols = [row["v"] for row in vol_rows if row["session_id"] != sid]
    if cur_vol and prior_vols and cur_vol > max(prior_vols):
        prs.append({"type": "volume", "exercise_name": None, "value": cur_vol, "unit": "kg"})
    return prs

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

@app.get("/api/export")
def export_data(response: Response):
    response.headers["Cache-Control"] = "no-store"
    with db() as conn:
        version = conn.execute("PRAGMA user_version").fetchone()[0]
        tables = {t: [dict(r) for r in conn.execute(f"SELECT * FROM {t}").fetchall()] for t in TABLES}
    return {"exported_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "schema_version": version, "tables": tables}

@app.post("/api/import")
def import_data(payload: ImportIn):
    if payload.mode != "replace" or not payload.confirm:
        raise HTTPException(400, "import requires mode='replace' and confirm=true")
    env = payload.envelope
    if not isinstance(env, dict) or "tables" not in env or "schema_version" not in env:
        raise HTTPException(400, "malformed envelope")
    try:
        env_version = int(env["schema_version"])
    except (ValueError, TypeError):
        raise HTTPException(400, "malformed envelope")
    if not isinstance(env["tables"], dict):
        raise HTTPException(400, "malformed envelope")
    expected_tables = [t for t in TABLES if TABLE_INTRODUCED_AT[t] <= env_version]
    if any(t not in env["tables"] for t in expected_tables):
        raise HTTPException(400, "envelope missing expected tables")
    with db() as conn:
        cur_version = conn.execute("PRAGMA user_version").fetchone()[0]
        if env_version > cur_version:
            raise HTTPException(400, "envelope schema_version newer than app")
        # auto-snapshot the live DB before wiping (VACUUM INTO must run outside a
        # txn; microseconds so back-to-back imports can't collide on the name)
        snap_dir = os.path.dirname(DB_PATH)
        snap = os.path.join(snap_dir,
                            f"pre-import-{datetime.now(timezone.utc):%Y%m%d-%H%M%S-%f}.db")
        conn.execute(f"VACUUM INTO '{snap}'")
        # Prune here, not after the import: failed imports also leave a
        # snapshot behind and must not accumulate them unbounded.
        for old in sorted(glob.glob(os.path.join(snap_dir, "pre-import-*.db")))[:-PRE_IMPORT_SNAPSHOTS_KEPT]:
            try:
                os.remove(old)
            except OSError:
                pass
        try:
            conn.execute("BEGIN")
            for t in TABLES:
                if t == "profiles" and "profiles" not in env["tables"]:
                    # Pre-v4 envelope has no opinion about profiles at all — leave the
                    # live table untouched rather than wiping the seed admin with no
                    # profiles data in the envelope to restore it from. Every write
                    # endpoint depends on at least one profile existing.
                    continue
                valid = {r[1] for r in conn.execute(f"PRAGMA table_info({t})")}
                conn.execute(f"DELETE FROM {t}")
                for r in env["tables"].get(t, []):
                    if not set(r.keys()) <= valid:
                        raise ValueError(f"unknown column in {t} row")
                    row = dict(r)
                    if "profile_id" in valid and "profile_id" not in row:
                        # Row predates profiles entirely (pre-v4 envelope) — attribute
                        # it to the live default profile, same backfill the original
                        # migration did for pre-existing data.
                        row["profile_id"] = _default_profile_id(conn)
                    cols = list(row.keys())
                    placeholders = ",".join("?" * len(cols))
                    conn.execute(f"INSERT INTO {t} ({','.join(cols)}) VALUES ({placeholders})",
                                 [row[c] for c in cols])
            # The DB's physical schema is already at cur_version (migrations
            # ran at startup); restoring older data must not record a lower
            # version, or a later restart could re-run a non-idempotent
            # migration against an already-migrated DB.
            conn.execute(f"PRAGMA user_version = {max(env_version, cur_version)}")
            conn.commit()
            restored = {t: conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in TABLES}
        except Exception:
            conn.rollback()
            raise HTTPException(400, "import failed; rolled back, live DB unchanged")
    return {"restored": restored}

# Serve React — MUST be last
if os.path.exists("static"):
    app.mount("/", StaticFiles(directory="static", html=True), name="static")
