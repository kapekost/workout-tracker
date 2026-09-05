from fastapi import FastAPI, HTTPException, Response, Request, Depends, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator
from typing import Literal, Optional
from contextlib import contextmanager
import sqlite3, os, json, glob, secrets, hashlib, time, urllib.request, urllib.error
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

def acting_profile_id(conn):
    """The profile whose data a request may read and mutate — the single seam
    every data endpoint scopes through, for reads and writes alike.

    Today it returns the default profile: #84's gate is still open, so there is
    no request-scoped identity yet, and routing every endpoint through one place
    keeps behaviour identical for now. #110 uses it to stop data leaking between
    profiles (reads were never scoped); #86 then replaces this body with the
    session lookup and deletes _default_profile_id — one function to change, not
    every call site.
    """
    return _default_profile_id(conn)

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

class SetPasswordIn(BaseModel):
    token: str = Field(min_length=1, max_length=256)
    password: str = Field(min_length=1, max_length=256)

class ForgotPasswordIn(BaseModel):
    email: str = Field(min_length=3, max_length=254)

class ProfileIn(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    email: str = Field(min_length=3, max_length=254)

class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    # Bounded so an over-long body can't be turned into free bcrypt work. The
    # real rules live in validate_password, which only runs when a password is
    # being *set* (#85), never when one is checked.
    password: str = Field(min_length=1, max_length=256)

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
    except (ValueError, UnicodeEncodeError):
        # ValueError: not a bcrypt hash. UnicodeEncodeError: not even ASCII, so
        # not a hash this ever wrote. Both are corrupt rows, and the contract
        # above says this returns False rather than 500ing the login path.
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

_dummy_hash_cache: dict[int, str] = {}

def _dummy_hash() -> str:
    """A real hash at the live cost, so a login for an unknown username pays the
    same CPU as one for a real account and the two cannot be told apart by
    timing. Cached per cost, so the first bogus login pays for it rather than
    import time — which would tax every test-module reload."""
    if BCRYPT_ROUNDS not in _dummy_hash_cache:
        _dummy_hash_cache[BCRYPT_ROUNDS] = bcrypt.hashpw(
            secrets.token_bytes(16), bcrypt.gensalt(rounds=BCRYPT_ROUNDS)).decode("ascii")
    return _dummy_hash_cache[BCRYPT_ROUNDS]

# --- Invites and resets (#85) ---
# Invite and reset are one mechanism. They differ only in kind, expiry, and
# what triggers them.
TOKEN_TTL = {
    # An invite goes to someone expecting it who may not act for days.
    "invite": "+7 days",
    # A reset can be triggered by anyone who knows an address, so keep the
    # window short.
    "reset": "+1 hour",
}
# The Tailscale URL today; #27's tunnel hostname replaces this one value later,
# which is the whole reason it is config and not a constant.
APP_BASE_URL = os.environ.get("APP_BASE_URL", "http://localhost:8080")
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
MAIL_FROM = os.environ.get("MAIL_FROM", "")

# Rate limiting, on /api/auth/login and /api/auth/forgot-password only.
# In-memory is honest for a single-container deployment: there is one process,
# so there is nothing to share state with, and a restart clearing the counters
# is acceptable for this threat. A table would add a write on the login path for
# no benefit at this scale.
RATE_LIMIT_MAX = 10
RATE_LIMIT_WINDOW_S = 15 * 60
_rate_windows: dict[str, tuple[float, int]] = {}

def reset_rate_limits() -> None:
    """Tests only — the window store is process-global by design."""
    _rate_windows.clear()

def _rate_limit_hit(key: str) -> bool:
    """Count one attempt against a fixed window. True once over the limit."""
    now = time.time()
    start, count = _rate_windows.get(key, (now, 0))
    if now - start >= RATE_LIMIT_WINDOW_S:
        start, count = now, 0
    count += 1
    _rate_windows[key] = (start, count)
    return count > RATE_LIMIT_MAX

def enforce_rate_limit(request: Request, *keys: str) -> None:
    """429 if any of the caller's counters is over. Keyed by IP *and* by the
    subject (username or email), per the design.

    This exists because cost-12 hashing is 627 ms of CPU on a 4-core box that
    also runs Home Assistant — an unthrottled login endpoint is a CPU amplifier
    pointed at the house. So callers must invoke this *before* doing any hashing;
    rejecting afterwards would leave the amplifier fully intact.
    """
    ip = request.client.host if request.client else "unknown"
    # Every counter is evaluated, not short-circuited, so one key going over
    # does not stop the others from recording the attempt.
    over = [_rate_limit_hit(k) for k in (f"ip:{ip}", *keys)]
    if any(over):
        raise HTTPException(429, "too many attempts; try again in a few minutes")

def hash_token(raw: str) -> str:
    """Tokens are stored as their SHA-256 and never in the clear.

    A database read — including a leaked backup — therefore cannot be replayed
    into account access. The raw value exists in the email and nowhere else.
    Plain SHA-256 rather than bcrypt on purpose: this input is 32 bytes of
    CSPRNG output, so there is no guessable password to slow an attacker down
    against, and lookup happens on every redemption.
    """
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()

def mint_token(conn, profile_id: int, kind: str) -> str:
    """Insert a token row and return the raw value. Does not commit."""
    if kind not in TOKEN_TTL:
        raise ValueError(f"unknown token kind: {kind}")
    raw = secrets.token_urlsafe(32)
    conn.execute("INSERT INTO auth_tokens (profile_id, token_hash, kind, expires_at) "
                 f"VALUES (?, ?, ?, datetime('now', '{TOKEN_TTL[kind]}'))",
                 (profile_id, hash_token(raw), kind))
    return raw

def send_email(to: str, subject: str, body: str) -> None:
    """The mailer seam — tests replace this; the owner bootstrap uses it for real.

    urllib rather than the `resend` package: this is one POST, and every runtime
    dependency has to clear the aarch64-wheel bar in Dockerfile:25-28.
    """
    if not RESEND_API_KEY or not MAIL_FROM:
        raise RuntimeError("RESEND_API_KEY and MAIL_FROM must be set to send mail")
    payload = json.dumps({"from": MAIL_FROM, "to": [to],
                          "subject": subject, "text": body}).encode("utf-8")
    req = urllib.request.Request(
        "https://api.resend.com/emails", data=payload, method="POST",
        headers={"Authorization": f"Bearer {RESEND_API_KEY}",
                 "Content-Type": "application/json",
                 # Required, not cosmetic. Cloudflare fronts api.resend.com and
                 # blocks urllib's default "Python-urllib/3.x" agent outright —
                 # a 403 with Cloudflare error 1010, which looks exactly like a
                 # bad API key. Found on the first real send, 2026-09-05.
                 "User-Agent": f"workout-tracker/{APP_VERSION}"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            if resp.status >= 300:
                raise RuntimeError(f"resend returned HTTP {resp.status}")
    except urllib.error.HTTPError as exc:
        # Carry the body: "403" alone sent the first diagnosis down the wrong
        # path (a suspected bad key) when the answer was in the response.
        detail = exc.read().decode("utf-8", "replace")[:300].strip()
        raise RuntimeError(f"resend returned HTTP {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"could not reach resend: {exc.reason}") from exc

def _token_email(to: str, raw: str, kind: str) -> None:
    link = f"{APP_BASE_URL}/set-password?token={raw}"
    if kind == "invite":
        send_email(to, "Your Workout Tracker invite",
                   "You have been invited to Workout Tracker.\n\n"
                   f"Set your password here:\n{link}\n\n"
                   "The link works once and expires in 7 days.")
    else:
        send_email(to, "Reset your Workout Tracker password",
                   "Someone asked to reset your Workout Tracker password.\n\n"
                   f"Set a new one here:\n{link}\n\n"
                   "The link works once and expires in 1 hour. "
                   "If this was not you, you can ignore this email.")

def _token_email_quietly(to: str, raw: str, kind: str) -> None:
    """Send and swallow failures. Only for /api/auth/forgot-password, where a
    visible send failure would itself be an enumeration signal."""
    try:
        _token_email(to, raw, kind)
    except Exception:
        pass

def current_profile(request: Request) -> dict:
    """Request-scoped identity, from the session cookie.

    Defined here but deliberately NOT applied to the data endpoints: #86 flips
    the gate across all of them and deletes _default_profile_id. Wiring it in
    early would close the app before the invite flow (#85) and the owner
    bootstrap exist, locking the owner out of their own history.
    """
    with db() as conn:
        row = session_profile(conn, request.cookies.get(SESSION_COOKIE))
    if row is None:
        raise HTTPException(401, "not authenticated")
    return dict(row)

def bootstrap_owner(email: str, username: str = "kapekost") -> dict:
    """Give an existing profile an email address and mail it a real invite.

    This is how the owner's own account comes into being — through the same
    invite path as everyone else, with no backdoor and no password argument.
    Running it is the first genuine Resend send, which is the point: the
    integration is proven on live infrastructure before anyone else is invited.

    Returns what happened rather than raising on a send failure, so a mail
    outage leaves a valid token to re-send rather than a half-done bootstrap.
    """
    with db() as conn:
        row = conn.execute("SELECT id, password_hash FROM profiles WHERE username = ?",
                           (username,)).fetchone()
        if row is None:
            raise ValueError(f"no profile named {username!r}")
        conn.execute("UPDATE profiles SET email = ? WHERE id = ?", (email, row["id"]))
        # Same rule as forgot-password: an account with no password gets an
        # invite, one that has a password gets a reset.
        kind = "reset" if row["password_hash"] else "invite"
        raw = mint_token(conn, row["id"], kind)
        conn.commit()
    sent, error = True, None
    try:
        _token_email(email, raw, kind)
    except Exception as exc:
        sent, error = False, str(exc)
    return {"username": username, "email": email, "kind": kind,
            "sent": sent, "error": error}

def require_admin(profile: dict = Depends(current_profile)) -> dict:
    if profile["role"] != "admin":
        raise HTTPException(403, "admin only")
    return profile

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

@app.post("/api/auth/set-password")
def set_password(body: SetPasswordIn, response: Response):
    with db() as conn:
        row = conn.execute(
            "SELECT id, profile_id FROM auth_tokens WHERE token_hash = ? "
            "AND used_at IS NULL AND expires_at > datetime('now')",
            (hash_token(body.token),)).fetchone()
        # Unknown, expired and already-used all give the same message: which one
        # it was is not the caller's business.
        if row is None:
            raise HTTPException(400, "this link is invalid or has expired")
        try:
            password_hash = hash_password(body.password)
        except ValueError as exc:
            # A clear 400 rather than a 500 out of bcrypt — and the token is
            # still unused, so a too-short password costs the user nothing.
            raise HTTPException(400, str(exc))
        conn.execute("UPDATE profiles SET password_hash = ? WHERE id = ?",
                     (password_hash, row["profile_id"]))
        conn.execute("UPDATE auth_tokens SET used_at = datetime('now') WHERE id = ?", (row["id"],))
        # Every existing session dies here. This is the entire reason sessions
        # are server-side rows: a reset must end sessions a thief already holds.
        revoke_sessions(conn, row["profile_id"])
        session_id = issue_session(conn, row["profile_id"])
        conn.commit()
        profile = conn.execute(
            "SELECT id, username, role, icon, email FROM profiles WHERE id = ?",
            (row["profile_id"],)).fetchone()
    set_session_cookie(response, session_id)
    return dict(profile)

@app.post("/api/auth/forgot-password")
def forgot_password(body: ForgotPasswordIn, background: BackgroundTasks, request: Request):
    enforce_rate_limit(request, f"email:{body.email}")
    with db() as conn:
        row = conn.execute("SELECT id, email, password_hash FROM profiles WHERE email = ?",
                           (body.email,)).fetchone()
        if row is not None:
            # A profile that never set a password gets an invite-equivalent
            # rather than an error, so someone who missed their invite can
            # self-serve instead of needing an admin.
            kind = "reset" if row["password_hash"] else "invite"
            raw = mint_token(conn, row["id"], kind)
            conn.commit()
            # Sent after the response so the network call cannot be timed —
            # a send that happens only for real addresses would otherwise be an
            # enumeration oracle no matter how identical the body is.
            background.add_task(_token_email_quietly, row["email"], raw, kind)
    # Identical status and body whether or not the address exists.
    return {"status": "ok"}

@app.post("/api/profiles", status_code=201)
def create_profile(body: ProfileIn, admin: dict = Depends(require_admin)):
    with db() as conn:
        if conn.execute("SELECT 1 FROM profiles WHERE username = ? OR email = ?",
                        (body.username, body.email)).fetchone():
            raise HTTPException(409, "username or email already exists")
        profile_id = conn.execute(
            "INSERT INTO profiles (username, email, role) VALUES (?, ?, 'member')",
            (body.username, body.email)).lastrowid
        raw = mint_token(conn, profile_id, "invite")
        conn.commit()
    # Sent inline, not in the background: this caller is an authenticated admin
    # who needs to know whether the invite actually went out. A send failure
    # leaves a real profile and an unused token, so re-inviting is the fix —
    # never a 500, and never a half-created account.
    invite_sent = True
    try:
        _token_email(body.email, raw, "invite")
    except Exception:
        invite_sent = False
    return {"id": profile_id, "username": body.username, "email": body.email,
            "role": "member", "invite_sent": invite_sent}

@app.post("/api/auth/login")
def login(body: LoginIn, response: Response, request: Request):
    # Before any hashing — see enforce_rate_limit.
    enforce_rate_limit(request, f"user:{body.username}")
    with db() as conn:
        row = conn.execute(
            "SELECT id, username, role, icon, email, password_hash FROM profiles "
            "WHERE username = ?", (body.username,)).fetchone()
        stored = row["password_hash"] if row is not None else None
        # verify_password runs first on every path — against the real hash, or
        # against _dummy_hash() when the username is unknown or the stored hash
        # is NULL — so all three cost the same. Only then do the identity checks
        # reject. One generic message for every failure.
        ok = verify_password(body.password, stored or _dummy_hash())
        if not ok or row is None or stored is None:
            raise HTTPException(401, "invalid username or password")
        session_id = issue_session(conn, row["id"])
        conn.commit()
    set_session_cookie(response, session_id)
    return {"id": row["id"], "username": row["username"], "role": row["role"],
            "icon": row["icon"], "email": row["email"]}

@app.post("/api/auth/logout", status_code=204)
def logout(request: Request, response: Response):
    # 204 whether or not the cookie named a live session: logout must not double
    # as a way to probe which session ids exist. Ends this session only — every
    # session for the account is revoke_sessions, which #85's reset calls.
    session_id = request.cookies.get(SESSION_COOKIE)
    if session_id:
        with db() as conn:
            conn.execute("DELETE FROM auth_sessions WHERE id = ?", (session_id,))
            conn.commit()
    clear_session_cookie(response)

@app.get("/api/auth/me")
def auth_me(profile: dict = Depends(current_profile)):
    return profile

@app.get("/api/profile/me")
def get_current_profile():
    # Temporary, like _default_profile_id: "the acting profile" is the seed
    # admin until #67 introduces real login. Replaced there, not extended.
    with db() as conn:
        profile_id = acting_profile_id(conn)
        row = conn.execute(
            "SELECT id, username, role, icon FROM profiles WHERE id = ?", (profile_id,)).fetchone()
        return dict(row)

@app.post("/api/sessions")
def create_session(s: SessionIn):
    with db() as conn:
        profile_id = acting_profile_id(conn)
        cur = conn.execute("INSERT INTO sessions (date, workout_day, profile_id) VALUES (?, ?, ?)",
                           (datetime.now().strftime("%Y-%m-%d"), s.workout_day, profile_id))
        conn.commit()
        row = conn.execute("SELECT * FROM sessions WHERE id = ?", (cur.lastrowid,)).fetchone()
        return dict(row)

@app.get("/api/sessions")
def list_sessions():
    with db() as conn:
        rows = conn.execute(
            "SELECT * FROM sessions WHERE profile_id = ? ORDER BY created_at DESC LIMIT 60",
            (acting_profile_id(conn),)).fetchall()
        return [dict(r) for r in rows]

@app.get("/api/sessions/{sid}")
def get_session(sid: int):
    with db() as conn:
        s = conn.execute("SELECT * FROM sessions WHERE id = ? AND profile_id = ?",
                         (sid, acting_profile_id(conn))).fetchone()
        if not s:
            raise HTTPException(404)
        sets = conn.execute("SELECT * FROM sets WHERE session_id = ? ORDER BY logged_at", (sid,)).fetchall()
        return {**dict(s), "sets": [dict(x) for x in sets]}

@app.patch("/api/sessions/{sid}")
def patch_session(sid: int, p: SessionPatch):
    with db() as conn:
        # 404 (not 403) when the session belongs to another profile — its
        # existence is not the caller's business (#110).
        if not conn.execute("SELECT 1 FROM sessions WHERE id = ? AND profile_id = ?",
                            (sid, acting_profile_id(conn))).fetchone():
            raise HTTPException(404)
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
        # 404 when the session belongs to another profile (#110).
        if not conn.execute("SELECT 1 FROM sessions WHERE id = ? AND profile_id = ?",
                            (sid, acting_profile_id(conn))).fetchone():
            raise HTTPException(404)
        conn.execute("DELETE FROM sets WHERE session_id = ?", (sid,))
        conn.execute("DELETE FROM sessions WHERE id = ?", (sid,))
        conn.commit()
        return {"deleted": True}

@app.post("/api/sessions/{sid}/sets")
def add_set(sid: int, s: SetIn):
    with db() as conn:
        profile_id = acting_profile_id(conn)
        # 404 when the session is another profile's — adding a set to a session
        # you do not own is a cross-profile write, same rule as PATCH/DELETE (#110).
        if not conn.execute("SELECT id FROM sessions WHERE id = ? AND profile_id = ?",
                            (sid, profile_id)).fetchone():
            raise HTTPException(404)
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
        # 404 unless the set's session belongs to the acting profile (#110).
        owned = conn.execute(
            "SELECT 1 FROM sets st JOIN sessions s ON s.id = st.session_id "
            "WHERE st.id = ? AND st.session_id = ? AND s.profile_id = ?",
            (set_id, sid, acting_profile_id(conn))).fetchone()
        if not owned:
            raise HTTPException(404)
        conn.execute("DELETE FROM sets WHERE id = ? AND session_id = ?", (set_id, sid))
        conn.commit()
        return {"deleted": True}

@app.post("/api/personal-bests")
def create_personal_best(pb: PersonalBestIn):
    with db() as conn:
        profile_id = acting_profile_id(conn)
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
            "SELECT * FROM personal_bests WHERE profile_id = ? "
            "ORDER BY exercise_name, weight_kg DESC", (acting_profile_id(conn),)).fetchall()
        return [dict(r) for r in rows]

@app.delete("/api/personal-bests/{pb_id}")
def delete_personal_best(pb_id: int):
    with db() as conn:
        # 404 when the personal best belongs to another profile (#110).
        if not conn.execute("SELECT 1 FROM personal_bests WHERE id = ? AND profile_id = ?",
                            (pb_id, acting_profile_id(conn))).fetchone():
            raise HTTPException(404)
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
                WHERE st.exercise_id = ? AND s.completed = 1 AND s.profile_id = ?
                GROUP BY s.id, s.date
                ORDER BY s.date DESC, s.id DESC LIMIT 60
            ) ORDER BY date ASC, sid ASC
        """, (exercise_id, acting_profile_id(conn))).fetchall()
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
            WHERE s.completed = 1 AND s.profile_id = ?
            GROUP BY st.exercise_id, st.exercise_name ORDER BY st.exercise_name
        """, (acting_profile_id(conn),)).fetchall()
        return [dict(r) for r in rows]

@app.get("/api/notes")
def get_notes():
    with db() as conn:
        rows = conn.execute("SELECT exercise_id, note FROM exercise_notes WHERE profile_id = ?",
                           (acting_profile_id(conn),)).fetchall()
        return {r["exercise_id"]: r["note"] for r in rows}

@app.put("/api/exercises/{exercise_id}/note")
def put_note(exercise_id: str, n: NoteIn):
    note = n.note.strip()
    with db() as conn:
        profile_id = acting_profile_id(conn)
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
            "WHERE s.completed = 1 AND st.exercise_id = ? AND s.id != ? AND s.profile_id = ? "
            "ORDER BY s.created_at DESC LIMIT 1",
            (exercise_id, exclude_session if exclude_session is not None else -1,
             acting_profile_id(conn))).fetchone()
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
                WHERE s.completed = 1 AND s.profile_id = ?
                GROUP BY st.exercise_id, s.id, s.date
            )
            SELECT cur.exercise_id, cur.date AS last_date, cur.last_at,
                   cur.sets, cur.volume_kg, prev.date AS prev_date
            FROM per_session cur
            LEFT JOIN per_session prev
                   ON prev.exercise_id = cur.exercise_id AND prev.rn = 2
            WHERE cur.rn = 1
            ORDER BY cur.exercise_id
        """, (acting_profile_id(conn),)).fetchall()
        return [dict(r) for r in rows]

@app.get("/api/sessions/{sid}/prs")
def session_prs(sid: int):
    with db() as conn:
        pid = acting_profile_id(conn)
        # 404 when the session belongs to another profile — its PRs are computed
        # only against that profile's own history, never across profiles (#110).
        if not conn.execute("SELECT 1 FROM sessions WHERE id = ? AND profile_id = ?",
                            (sid, pid)).fetchone():
            raise HTTPException(404)
        cur_sets = conn.execute("SELECT exercise_id, exercise_name, weight_kg, reps FROM sets WHERE session_id = ?", (sid,)).fetchall()
        prior = conn.execute(
            "SELECT st.exercise_id, st.weight_kg, st.reps FROM sets st "
            "JOIN sessions s ON s.id = st.session_id WHERE s.completed = 1 AND s.id != ? AND s.profile_id = ?", (sid, pid)).fetchall()
        pb_rows = conn.execute(
            "SELECT exercise_id, weight_kg, reps FROM personal_bests WHERE profile_id = ?", (pid,)).fetchall()
        prior = list(prior) + list(pb_rows)
        # session volumes for the volume PR
        vol_rows = conn.execute(
            "SELECT st.session_id, SUM(st.weight_kg*st.reps) v FROM sets st "
            "JOIN sessions s ON s.id = st.session_id WHERE s.completed = 1 AND s.profile_id = ? GROUP BY st.session_id", (pid,)).fetchall()

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
        profile_id = acting_profile_id(conn)
        conn.executemany(
            "INSERT INTO events (name, screen, props, profile_id) VALUES (?,?,?,?)",
            [(e.name, e.screen, json.dumps(e.props) if e.props is not None else None, profile_id) for e in events])
        conn.commit()

@app.get("/api/analytics/summary")
def analytics_summary(days: int = 30):
    window = f"-{int(days)} days"
    with db() as conn:
        pid = acting_profile_id(conn)
        by_name = conn.execute(
            "SELECT name, COUNT(*) c FROM events WHERE ts >= datetime('now', ?) AND profile_id = ? "
            "GROUP BY name ORDER BY c DESC", (window, pid)).fetchall()
        by_screen = conn.execute(
            "SELECT screen, COUNT(*) c FROM events WHERE ts >= datetime('now', ?) AND screen IS NOT NULL AND profile_id = ? "
            "GROUP BY screen ORDER BY c DESC", (window, pid)).fetchall()
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
