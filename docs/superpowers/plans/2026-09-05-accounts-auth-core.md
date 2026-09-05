# Accounts 1/4: schema v6 + auth core — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Issue:** #84 — step 1 of 4 in the accounts workstream (#85 Resend invite/reset → #86 gate flip →
#87 export/import role behaviour). A hard dependency order, not a preference.

**Spec:** `docs/superpowers/specs/2026-09-04-accounts-auth-design.md`. **Read it first** — it holds
the schema DDL, the endpoint list, the measurements and the owner decisions. This plan does not
repeat it; it records task ordering, the decisions the spec left open, and the checks that are
easy to skip.

**Goal:** Schema v6, bcrypt password hashing, an `auth_sessions`-backed session with a `wt_session`
cookie, a `current_profile` dependency, and `POST /api/auth/login` / `POST /api/auth/logout` /
`GET /api/auth/me` — **without gating any data endpoint**.

**Tech Stack:** FastAPI + `sqlite3` (Python 3.14), `bcrypt==5.0.0`, pytest.

## Global Constraints

- **TDD.** Write the failing test, run it, watch it fail for the right reason, then implement. 88
  backend + 210 frontend + 12 Playwright tests must stay green.
- **Do not gate the data endpoints, and do not touch `_default_profile_id`.** That is #86. This
  step must be deployable while the app is still open, so the invite flow and the owner bootstrap
  can be proven before the door closes. Task 6 adds a test that fails if someone does it early.
- **`auth_tokens` and `auth_sessions` must NOT join `TABLES` or `TABLE_INTRODUCED_AT`.** Restoring
  a backup must never resurrect a live session or an unused invite.
- **bcrypt cost 12**, measured at 627 ms on the deploy target. Do not raise it or swap in a
  memory-hard KDF without re-measuring there — the spec explains why that can OOM the box.
- **Passwords:** minimum 12 characters, maximum 72 **bytes** (bcrypt's limit; >=4.2 raises rather
  than truncating). No composition rules.
- **Out of scope:** all frontend work and the gate (#86); Resend, token minting, rate limiting and
  the bootstrap script (#85); export/import roles (#87). This step only *creates* `auth_tokens`.
- Backend commands run from `backend/` with a named interpreter — nothing is on `PATH`:
  `.venv/bin/python -m pytest -q`. A fresh worktree has no `.venv`:
  `python3.14 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt`.

## Decisions this plan makes that the spec left open

1. **Auth code stays in `backend/main.py`**, in one delimited `# --- Auth ---` section placed after
   `_last_backup()` and before `# --- API Routes ---`. `Dockerfile:35` COPYs `backend/main.py` by
   name, so a new module is a Dockerfile change plus a deploy risk this step has no reason to take.
   Keeping it in one block means #85 can lift it out whole if it outgrows the file.
2. **SQLite computes session expiry** — `datetime('now', '+30 days')` in the INSERT, and
   `expires_at <= datetime('now')` in the lookup. Stored timestamps then share one format with
   every other timestamp in the schema, so string comparison is well-defined by construction rather
   than by luck.
3. **`BCRYPT_ROUNDS` is a module constant that tests monkeypatch down to 4**, with one test pinning
   the real value at 12. At cost 12 every hashing test would cost ~200 ms on CI and 627 ms on the Pi.
4. **A `_dummy_hash()` timing equalizer on login**, cached per cost so it is paid on first use
   rather than at import. Without it a login for an unknown username returns without hashing and is
   trivially distinguishable by response time from a wrong password for a real account. This is the
   spec's own position for `/api/auth/forgot-password`, applied to the endpoint this step ships.
   **Six lines, flagged for the reviewer to drop if unwanted** — it is beyond the Issue's literal
   wording.
5. **`/api/profile/me` is left exactly as it is**, still answering from `_default_profile_id`
   alongside the new `/api/auth/me`. Two endpoints coexist on purpose until #86 removes the shim.

---

### Task 1: Schema v6 migration

**Files:** Modify `backend/main.py` (`_migrate`, after the `v < 5` block) · Create `backend/test_auth.py`

**Produces:** `PRAGMA user_version` = 6; `profiles.email TEXT` nullable with unique **partial** index
`idx_profiles_email` (`WHERE email IS NOT NULL`, so many profiles may stay NULL); `auth_tokens` and
`auth_sessions` per the spec's DDL, both with a `profile_id` index and `ON DELETE CASCADE`.

**Tests to write first:**
- v6 column/table shapes are exactly as specified (`PRAGMA table_info` on all three)
- two profiles may both hold a NULL email; a duplicate non-NULL email raises `IntegrityError`
- `auth_tokens.kind` rejects anything but `invite`/`reset`
- v5 → v6 on a populated DB preserves every row and leaves `email` NULL
- `init()` twice is idempotent
- neither auth table appears in `TABLES` or `TABLE_INTRODUCED_AT`, and `/api/export`'s table set is
  unchanged at schema 6
- a schema-5 envelope still imports

**Note for the test author:** the `mainmod` fixture has already migrated the temp DB to v6 before
any test body runs, so resetting `user_version` alone will not reproduce v5. Drop the index, the two
tables and the `email` column first — the same technique `test_profiles.py` uses for the rebuilt v4
tables.

- [ ] Write the failing tests
- [ ] Run them; confirm they fail on the missing tables, not on a typo
- [ ] Implement the `v < 6` migration block
- [ ] Tests pass; then the full backend suite. `test_profiles.py`'s expected profiles column set
      needs `"email"` added, with a comment naming #84 — exactly as #69 did for `"icon"`
- [ ] Commit: `feat(auth): schema v6 — profiles.email, auth_tokens, auth_sessions (#84)`

---

### Task 2: bcrypt dependency and password helpers

**Files:** Modify `backend/requirements.txt`, `backend/main.py` (imports + new `# --- Auth ---` section) · Test `backend/test_auth.py`

**Produces:**
- `BCRYPT_ROUNDS = 12`, `PASSWORD_MIN_LEN = 12`, `PASSWORD_MAX_BYTES = 72`
- `validate_password(password: str) -> None` — raises `ValueError` with a readable message
- `hash_password(password: str) -> str` — validates, returns an ASCII bcrypt hash
- `verify_password(password: str, password_hash: str | None) -> bool` — **never raises**; `False`
  for a NULL/empty/malformed hash

Add `bcrypt==5.0.0` to `requirements.txt`. Add `Request`, `Depends` to the fastapi import and
`secrets` + `import bcrypt` to the import block now, so it is edited once for Tasks 2-5.

**Tests to write first:**
- `BCRYPT_ROUNDS == 12` (this is the test that guards the measured value; everything else runs at 4)
- hash/verify round-trip; the hash starts `$2b$`; two hashes of one password differ
- `verify_password` returns `False` for `None`, `""` and a malformed hash — without raising
- a password under 12 characters is rejected
- 73 ASCII characters is rejected, and so is 30 four-byte emoji (**120 bytes** — the limit is bytes,
  not characters, and bcrypt would otherwise cut it at 72)

A `fast_bcrypt` fixture monkeypatching `mainmod.BCRYPT_ROUNDS = 4` keeps the suite fast.

**Rationale to carry into the code as comments:** a NULL `password_hash` means "invited, never set a
password" and must never authenticate; a malformed hash must be a failed login, not a 500.

- [ ] Write the failing tests → run → implement → tests pass
- [ ] Commit: `feat(auth): bcrypt cost-12 password hashing helpers (#84)`

---

### Task 3: Session store, cookie, and the `APP_COOKIE_SECURE` seam

**Files:** Modify `backend/main.py` (`# --- Auth ---`), `AGENTS.local.md.example` · Test `backend/test_auth.py`

**Produces:**
- `SESSION_COOKIE = "wt_session"`, `SESSION_TTL_DAYS = 30`, `APP_COOKIE_SECURE` (env, `"1"` is on,
  default off)
- `issue_session(conn, profile_id) -> str` — `secrets.token_urlsafe(32)`; inserts the row, **does
  not commit** (the caller owns the transaction)
- `session_profile(conn, session_id) -> Row | None` — returns `id, username, role, icon, email`
  (**never `password_hash`**); deletes the row on expiry, opportunistically, with no reaper process
- `revoke_sessions(conn, profile_id) -> None` — unused in #84; #85's password reset is its first
  caller, and it is tested here. This is the whole reason sessions are server-side rows rather than
  a signed stateless cookie: a reset must end sessions that already exist.
- `set_session_cookie(response, session_id)` / `clear_session_cookie(response)`

**Tests to write first:**
- a session row lands with an expiry ~30 days out, and ids differ between issues
- `session_profile` returns the profile for a live session and `None` for unknown/empty/`None` ids
- an expired session returns `None` **and its row is gone afterwards**
- `revoke_sessions` kills every session for that profile and leaves another profile's alone
- deleting a profile cascades to its sessions
- the cookie is `HttpOnly`, `SameSite=lax`, `Max-Age=2592000`, `Path=/`
- **not** `Secure` by default; `Secure` when `APP_COOKIE_SECURE` is on. The target is plain HTTP on
  a tailnet today — shipping `Secure` before #27 terminates TLS would silently break login

**Docs:** add an `## Application environment` section to `AGENTS.local.md.example` with
`APP_COOKIE_SECURE=0` and a placeholder comment. Nothing secret in a tracked file.
`APP_BASE_URL`/`RESEND_API_KEY`/`MAIL_FROM` are #85's.

- [ ] Write the failing tests → run → implement → tests pass
- [ ] Commit: `feat(auth): server-side sessions and the wt_session cookie (#84)`

---

### Task 4: `current_profile` dependency and `GET /api/auth/me`

**Files:** Modify `backend/main.py` · Test `backend/test_auth.py`

**Produces:** `current_profile(request: Request) -> dict` — reads the cookie, validates via
`session_profile`, returns `{id, username, role, icon, email}`, raises `HTTPException(401)`
otherwise. And `GET /api/auth/me`, its only consumer in this step.

Tests mint sessions directly with `issue_session`, so this task is testable before login exists.

**Tests to write first:** 401 with no cookie · 401 on an unknown cookie · 401 on an expired session ·
200 returning the seeded profile for a live session.

Carry into the docstring *why* the dependency is defined but unwired: wiring it in before #85's
invite flow and the owner bootstrap exist would lock the owner out of their own history.

- [ ] Write the failing tests → run → implement → tests pass
- [ ] Commit: `feat(auth): current_profile dependency and GET /api/auth/me (#84)`

---

### Task 5: `POST /api/auth/login`

**Files:** Modify `backend/main.py` (a `LoginIn` model, `_dummy_hash()`, the route) · Test `backend/test_auth.py`

**Produces:** `POST /api/auth/login` taking `{username, password}` → 200 with
`{id, username, role, icon, email}` plus `Set-Cookie: wt_session=...`, or **401 with one generic
message** for every failure.

`LoginIn` bounds `username` at 64 and `password` at 256 characters so an over-long body cannot be
turned into free bcrypt work. The real rules live in `validate_password`, which only runs when a
password is *set* (#85), not checked.

**Order matters in the handler:** `verify_password` runs on every path — against the real hash, or
against `_dummy_hash()` when the username is unknown or the stored hash is NULL — and only then do
the `row is None` / `stored is None` checks reject. Same CPU cost either way; see decision 4.

There is no API to create a profile with a password until #85, so the test fixture inserts one
directly.

**Tests to write first:**
- success sets an `HttpOnly` cookie, returns the profile, and that cookie works on `/api/auth/me`
- the response never contains `password_hash`
- wrong password → 401, **no** `Set-Cookie`
- unknown username → 401 with the *same* `detail` string as a wrong password
- the seeded `kapekost` profile (NULL hash) cannot log in on any password, empty included
- success creates exactly one session row; a failure creates none

- [ ] Write the failing tests → run → implement → tests pass
- [ ] Commit: `feat(auth): POST /api/auth/login issues a session cookie (#84)`

---

### Task 6: `POST /api/auth/logout`, the open-gate guard, and the arm64 build

**Files:** Modify `backend/main.py` · Test `backend/test_auth.py`

**Produces:** `POST /api/auth/logout` → **204 always**, whether or not the cookie named a live
session, so it cannot be used to probe which session ids exist. Deletes that one row and expires the
cookie.

**Tests to write first:**
- logout deletes the row, expires the cookie, and `/api/auth/me` then 401s
- logout is idempotent — 204 with no cookie and with an unknown one
- logout ends **this** session only, not every session for the account (that is `revoke_sessions`,
  and #85's password reset is what calls it)
- **a parametrized test that the data endpoints are still open** — `/api/sessions`, `/api/notes`,
  `/api/personal-bests`, `/api/progress`, `/api/exercises/recency`, `/api/analytics/summary`,
  `/api/export`, `/api/profile/me`, `/api/health` all answer 200 with no cookie. #86 flips this to
  expect 401 (except `/api/health`, which stays open for the deploy smoke check). Until then it is
  what makes "do not close the gate early" a failing test rather than a line of prose

- [ ] Write the failing tests → run → implement → tests pass
- [ ] Full backend suite from `backend/`: `.venv/bin/python -m pytest -q`
- [ ] Frontend suite from `frontend/`: `npm test` — nothing here touches it; this run proves it
- [ ] **Build the arm64 image by hand: `docker buildx build --platform linux/arm64 -t wt-arm64-check .`**
      `bcrypt` is the first new runtime dependency since the py3.14 bump, and `Dockerfile:25-28`
      says why this matters: **CI never builds this Dockerfile**, so a missing aarch64 wheel is
      invisible to every green check and surfaces only as a failed build on the Pi. Expect the
      `pip install` layer to resolve `bcrypt==5.0.0` from a wheel with **no compilation step**. If
      pip falls back to building from source, **stop** — the no-build-tools premise is broken, and
      that is a hard stop for the owner, not something to patch by adding gcc
- [ ] Commit: `feat(auth): POST /api/auth/logout, and a guard that the gate stays open (#84)`

---

## Review, PR and deploy

- [ ] `superpowers:requesting-code-review` (spec conformance + code quality), **and**
      `/security-review` — this is auth/session/token handling, the class GUARDRAILS calls
      destructive.
- [ ] PR with `Closes #84`. `gh pr checks <PR> --watch --fail-fast`, then confirm
      `gh pr view <PR> --json headRefOid,statusCheckRollup` shows the commit just pushed (a rollup
      immediately after a push can be stale), then `gh pr merge <PR> --squash --delete-branch`.
      Never `--auto`.
- [ ] Deploy: this is a schema migration, so per `AGENTS.md` an `/api/export` snapshot beforehand is
      mandatory and a restore drill follows. Confirm `PRAGMA user_version` is 6 on the Pi and
      `/api/health` still answers 200. Leave `APP_COOKIE_SECURE` unset until #27 terminates TLS.
- [ ] Write back on #85: `auth_tokens` already exists, `validate_password`/`hash_password` are ready
      for its set-password endpoint, and `revoke_sessions` is what its password reset must call.

## Spec coverage

Schema v6 → Task 1. Password hashing → Task 2. Sessions, cookie and `APP_COOKIE_SECURE` → Task 3.
`current_profile` → Task 4. Login/logout/me → Tasks 4-6. The Issue's named tests: populated-DB
migration and <=v5 envelope import (Task 1), login success/failure (Task 5), session validate and
revoke (Tasks 3 and 6), expired session rejected (Tasks 3 and 4).
