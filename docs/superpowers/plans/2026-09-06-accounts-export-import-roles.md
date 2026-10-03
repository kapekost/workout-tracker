# Accounts 5/5: export/import role behaviour — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Issue:** #87 — step 5 of 5 in the accounts workstream. Covered by the standing approval recorded
in `DECISIONS.md` 2026-09-05 ("Standing approval: the accounts workstream (#105, #86, #87)"). No
`approved` label needed.

**Spec:** `docs/superpowers/specs/2026-09-04-accounts-auth-design.md:213` names the two behaviours
this issue ships (admin full dump/restore, member own-rows only) but not the mechanics of a member
*merge* — that's what this plan works out.

**Goal:** `/api/export` and `/api/import` become reachable by any authenticated profile, not just
admins. An **admin** keeps exactly today's behaviour (whole-DB export, whole-DB replace) — that
code path does not change. A **member** gets a new, additive path: export returns only their own
rows; import inserts rows from an envelope into their own profile, never touching another
account's data and never wiping anything.

**Tech stack:** FastAPI + `sqlite3` (Python 3.14), pytest. Backend-only — confirmed by reading
`frontend/src/pages/Home.jsx` and `frontend/src/lib/exportData.js`: the "Export my data" button and
`downloadExport()` already call `/api/export` unconditionally with no role branching and no admin
gate in the UI. Today a member's tap 403s; once the backend accepts members this button starts
working for them with **no frontend change**. There is no import UI at all (`/api/import` is
API/script-only, used by the restore drill) — nothing to touch there either.

## Global Constraints

- **TDD.** Write the failing test, run it, watch it fail for the right reason, then implement.
  Backend suite (225 tests as of #86) must stay green throughout.
- **Keep the admin path untouched.** `/api/export`'s admin branch and `/api/import`'s
  `mode="replace"` branch keep their exact existing logic, byte-for-byte where practical. Every
  existing admin-path test in `test_foundations.py`, `test_auth.py`, `test_profiles.py`,
  `test_personal_bests.py`, `test_review_fixes.py` must pass unmodified.
- **Efficient, not overengineered.** No new dependencies, no generic "merge strategy" abstraction.
  The member path is a second, short branch next to the admin one — not a rewrite of either
  endpoint into a shared framework.
- Backend commands run from `backend/` with the venv interpreter: `.venv/bin/python -m pytest -q`.
  A fresh worktree has no `.venv` — `python3.14 -m venv .venv && .venv/bin/pip install -r
  requirements-dev.txt`.
- Out of scope: anything frontend (confirmed above — none needed); changing what tables exist;
  changing the admin snapshot/prune mechanism.

## Decisions this plan makes that the issue left open

The issue's spec says *what* (admin full dump/restore, member own rows) but not *how* a member
import can be additive without an id space of its own. These are the mechanics:

1. **Dependency change:** both endpoints move from `Depends(require_admin)` to
   `Depends(current_profile)`. Each handler branches internally on `profile["role"]`. `require_admin`
   itself is untouched — three other endpoints still use it directly
   (`backup_status`, `create_profile`, and nothing else — verify with `grep -n require_admin
   backend/main.py` before assuming the list is exactly these two).

2. **Member export scope:** filter every table in `TABLES` to the caller's own rows —
   `WHERE profile_id = :pid` for `sessions`, `sets` (via its `session_id` join — see below), `events`,
   `exercise_notes`, `personal_bests`; `WHERE id = :pid` for `profiles` (so the envelope still has a
   `profiles` key with exactly one row, keeping the shared envelope-validation code below happy with
   no special-casing). `sets` does carry its own `profile_id` column (added alongside `sessions` and
   `events` in the v3→v4 migration), but it is scoped through a join on its owning session instead of
   filtering that column directly — `sessions` is the authoritative owner (`sets` cascade-deletes from
   it), and `add_set` already refuses to attach a set to a session the caller doesn't own, so the two
   predicates pick out identical rows for everything the API can produce. Join it:
   `SELECT sets.* FROM sets JOIN sessions ON sets.session_id = sessions.id WHERE
   sessions.profile_id = :pid`, matching how every other `sets` query in this file already scopes
   (`add_set`, `delete_set`).

3. **Member import is `mode="merge"`, not `mode="replace"`.** The existing
   `if payload.mode != "replace" or not payload.confirm: 400` check becomes role-conditional:
   admin still requires `mode="replace"`; member requires `mode="merge"` (`confirm=True` required
   either way — merge still mutates data, just additively). A member sending `mode="replace"` (or an
   admin sending `mode="merge"`) is the same 400 shape as today's "wrong mode" rejection — not a 403,
   since it's a malformed request, not a permissions probe.

4. **Shared envelope validation stays shared.** The malformed-envelope, non-numeric-schema-version,
   newer-than-app-schema, and expected-tables checks run identically regardless of role, *before*
   branching to replace-vs-merge execution. A member's own export always contains a `profiles` key
   (their own row, per #2), so the existing `expected_tables` check needs no member-specific
   exception.

5. **Member merge never touches the `profiles` table**, even though it's present in the envelope
   (per #2). A member cannot create or modify accounts — that table's envelope contents are read for
   validation shape only and then ignored at apply time.

6. **No pre-import snapshot for a member merge.** The admin path's `VACUUM INTO` snapshot exists
   because a *replace* can lose everything. A merge only ever adds rows scoped to the caller's own
   `profile_id` — nothing is deleted, so there's nothing a snapshot would be protecting against.
   Skipping it is the "not overengineered" call, not an oversight.

7. **Id remapping for `sessions` → `sets`.** Envelope rows carry their original autoincrement `id`s,
   which will collide with live rows (the caller's own prior sessions, or anyone else's). Merge
   drops `id` and `profile_id` from every incoming `sessions` row, forces `profile_id` to the
   caller's id, inserts, and records `old_id -> new_id` in a dict built *only* from this envelope's
   own `sessions` rows. Each `sets` row is then inserted with its `session_id` rewritten through that
   map; a `sets` row whose `session_id` isn't in the map (envelope didn't include that session, or
   named a real id belonging to someone else) is **silently skipped** — it has no legitimate home,
   and this is precisely what makes "a member import naming another profile's data cannot write to
   it" true: the map is closed over the envelope's own content, never over the live database. `id`
   is dropped and re-assigned by `sets` too, for the same collision reason.

8. **`events` rows:** no FK to remap. Drop `id` and `profile_id`, force `profile_id` to caller, insert.

9. **`personal_bests` and `exercise_notes` use `INSERT OR IGNORE`.** Both carry a real uniqueness
   constraint scoped to `profile_id` (`personal_bests`: `UNIQUE(profile_id, exercise_id, weight_kg,
   reps, achieved_year)`; `exercise_notes`: `PRIMARY KEY (profile_id, exercise_id)`). Re-importing
   the same backup twice must not error — it should just add nothing the second time. Drop `id` /
   `profile_id` from the incoming row, force `profile_id` to caller, `INSERT OR IGNORE`. This is the
   one place merge is naturally idempotent; sessions/sets are not (documented in a test, not "fixed"
   — a real id-based idempotency scheme is more machinery than this issue's scope justifies).

10. **Column validation is reused, not reinvented.** Same `set(r.keys()) <= valid` check the admin
    path already runs (`PRAGMA table_info` for the target table) rejects unknown columns before any
    insert, for every merge table.

11. **Response shape is `{"merged": {...}}`, not `{"restored": {...}}`.** They mean different things
    — `restored` is "the DB now contains N rows total" (true after a replace); merge's number is "N
    rows were newly added this call", which is a different quantity and deserves a different key so
    a caller can't confuse the two.

12. **Helper functions, not one longer `if`.** Extract `_import_replace(conn, env, admin, cur_version,
    env_version) -> dict` (today's body, unchanged) and add `_import_merge(conn, env, profile_id,
    cur_version, env_version) -> dict` alongside it. The route handler does shared validation, then
    calls one or the other. This is what "keep the admin path untouched" means concretely — the
    admin branch becomes a function extraction, not a rewrite.

## Task 1: Member export scoping

Files: `backend/main.py`, `backend/test_profiles.py`.

- [ ] Write failing tests in `backend/test_profiles.py` (new `client`-based tests need a second,
      `member`-role profile with its own session — follow the pattern in
      `test_second_profile_can_log_the_same_pb_as_the_first` for creating the profile row, and
      `conftest.py`'s `client` fixture / `mainmod.issue_session` for giving it a session cookie
      rather than inserting raw rows and never authenticating as them):
  - `test_member_export_contains_only_their_own_rows` — seed data for both the seed admin (via
    `client`) and a second member profile (own session), assert the member's `/api/export` returns
    their own sessions/sets/events/personal_bests/exercise_notes and *not* the admin's, and that
    `tables["profiles"]` has exactly one row: their own.
  - `test_member_export_still_401s_with_no_session` — `anon_client` still gets 401 (this changes the
    dependency, so re-confirm the gate itself didn't loosen).
  - `test_admin_export_unchanged` — with the seeded admin, assert `/api/export` still returns every
    profile's rows (existing behaviour, now under explicit test naming it as a property rather than
    incidentally covered by `test_export_envelope_shape`).
- [ ] Implement: change `/api/export`'s dependency to `Depends(current_profile)`. Branch:
  `if profile["role"] == "admin":` run the existing body unchanged. `else:` build the same envelope
  shape, but query each table scoped per decision #2 above (the `sets` join through `sessions`).
- [ ] Run `.venv/bin/python -m pytest -q` — full suite green, including all pre-existing export
      tests unmodified.

## Task 2: Member import — additive merge

Files: `backend/main.py`, `backend/test_profiles.py`.

- [ ] Write failing tests in `backend/test_profiles.py`:
  - `test_member_import_merges_into_their_own_profile` — member exports their own envelope (from
    Task 1's scoped export), posts it back with `mode="merge", confirm=True`; assert the response is
    `{"merged": {...}}` with counts matching what was in the envelope, and a follow-up export shows
    the rows doubled (merge is additive — this is the property, not a bug, and the test should say
    so).
  - `test_member_import_cannot_write_to_another_profile` — member crafts an envelope with a
    `sessions`/`sets`/`personal_bests` row carrying another profile's real `profile_id`, imports it;
    assert the resulting rows are attributed to the importing member (`profile_id` forced), and the
    other profile's own export is unchanged.
  - `test_member_import_drops_orphaned_sets` — envelope's `sets` list includes a row whose
    `session_id` isn't present in the envelope's own `sessions` list; assert that set is silently
    skipped (not inserted, not an error).
  - `test_member_import_is_idempotent_for_personal_bests_and_notes` — import the same envelope
    twice; assert `personal_bests`/`exercise_notes` counts don't double the second time, but
    `sessions`/`sets` counts do (document why in the test body per decision #9 — the un-uniqueness
    is a documented POC limitation, not an oversight).
  - `test_member_import_ignores_profiles_table` — envelope's `profiles` list is mutated (e.g. a
    different `role`) before import; assert the live `profiles` row for that member is unchanged.
  - `test_member_import_rejects_replace_mode` — member posts `mode="replace"`, gets 400, DB
    untouched.
  - `test_member_import_requires_confirm` — same shape as the existing admin-path
    `test_import_requires_confirm`, for a member.
  - `test_member_import_rejects_unknown_columns` — mirrors
    `test_import_rejects_unknown_columns` for the member path.
  - `test_admin_import_rejects_merge_mode` — admin posts `mode="merge"`, gets 400 (today's "wrong
    mode" 400, now reachable from the other direction too).
  - Confirm (do not re-test, just verify by inspection while implementing) that every existing
    admin-path import test in `test_foundations.py`, `test_auth.py`, `test_profiles.py`,
    `test_review_fixes.py` still passes unmodified — they exercise `_import_replace` exactly as
    before.
- [ ] Implement: extract `_import_replace` (today's body, verbatim) and add `_import_merge` per
      decisions #6-11. Update the route handler: shared envelope validation, then
      `if payload.mode != ("replace" if profile["role"] == "admin" else "merge") or not
      payload.confirm: 400`, then call the matching helper.
- [ ] Run `.venv/bin/python -m pytest -q` — full suite green.

## Verification

- Full backend suite green (`.venv/bin/python -m pytest -q` from `backend/`).
- `grep -n require_admin backend/main.py` — confirm `backup_status` and `create_profile` are the
  only remaining callers, i.e. nothing else silently lost its admin gate.
- Manual sanity check (not a new test, just confirms the wiring): with a fresh dev DB, create a
  second member profile, log in as them, hit `/api/export` and `/api/import` from `curl` or the
  Home "Export my data" button — the button should now succeed for a member where it previously
  403'd.
