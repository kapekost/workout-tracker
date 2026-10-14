# Log Set idempotency (#339) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development or
> superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Issue:** #339 (labelled effort:L, so GUARDRAILS requires the split below before any code) ·
**Source:** finding 1.2 in `2026-10-03-design-review-findings.md`

**Goal:** a repeated tap, or a retry after a write that landed, logs one set instead of two, and
every successful log is announced.

**Why a plan at all:** the Issue names the fix ("client-generated set id the server ignores on
repeat") but not the storage shape, the migration, or what the key does to export, restore and merge.
This plan fixes those, and splits the Issue into two PRs.

## What is already true

- `sets` has no uniqueness constraint. `POST /api/sessions/{sid}/sets` (`add_set`) inserts
  unconditionally and returns the new row. `Workout.jsx` computes `set_number` client-side from
  the sets it has loaded.
- The only guard is `if (logging) return`, which closes at the response, so a tap that lands after
  the response but before the re-render, or a retry after the 8 s abort, still writes a second row.
- `SCHEMA_VERSION` is 8 and the tests track it symbolically (`mainmod.SCHEMA_VERSION`), so a bump
  does not touch them.
- `GET /api/export` is `SELECT *` per table, and `_import_replace` accepts any column that exists in
  `PRAGMA table_info`. A new column therefore round-trips through backup and restore with no change.
  `_import_merge` copies every key except `id`/`profile_id`.

## Decisions

1. **Client key, not server dedupe on `(session, exercise, set_number)`.** A unique index on those
   three fails to build if the live data already holds a duplicate (the bug we are fixing), and it
   cannot tell a double-tap from a deliberate second set that reuses a number after a delete. A
   per-tap key says exactly "this is the same request".
2. **Shape.** `sets.client_id TEXT`, nullable, with
   `CREATE UNIQUE INDEX idx_sets_client_id ON sets(profile_id, client_id) WHERE client_id IS NOT NULL`.
   Existing rows stay `NULL` and never collide. Scoped by `profile_id` so one profile's key can never
   suppress another's write, including when an admin acts as a member.
3. **Server behaviour.** `SetIn` gains optional `client_id` (1 to 64 characters). `add_set` runs
   `INSERT OR IGNORE`, then selects the row by `(profile_id, client_id)` and returns it, so a repeat
   gets the original row with the same `200` and the same body. If that row belongs to a different
   `session_id` the key was reused wrongly: answer `409`. No key: today's behaviour, unchanged.
4. **Migration v8 to v9.** `ALTER TABLE sets ADD COLUMN client_id TEXT` guarded by a
   `PRAGMA table_info` check (like the other `_migrate` blocks), then the index with
   `IF NOT EXISTS`. Both re-run safely. `SCHEMA_VERSION = 9`. No new table, so `TABLE_INTRODUCED_AT`
   is untouched and every v7 or v8 envelope stays importable (their `sets` rows just lack the key).
5. **Restore and replace.** No code change. An envelope with duplicate keys for one profile cannot
   come from the app; a hand-edited one fails the insert and rolls back to the existing `400`. A
   pre-v9 envelope restores with `NULL` keys.
6. **Merge drops the key.** `_import_merge` removes `client_id` from each incoming set along with
   `id` and `profile_id`. Merging a member's own export back into their account must keep working,
   and a kept key would collide with the originals and reject the whole import. Merge stays as
   non-deduplicating as its docstring says (decision #9).
7. **Client.** One key per log attempt: `crypto.randomUUID()` when the tap starts, held in a ref
   while the request is unresolved or failed without a server answer, and cleared on success, on a
   `4xx`, and whenever reps, weight or the exercise change. A retry of the same values reuses the
   key, so it cannot double-write. A plain second tap after success gets a new key and is a real set.
8. **Acknowledge every log.** A visually hidden `role="status"` `aria-live="polite"` region says
   "Set N logged, W kg x R" after each success (the PR toast stays as it is). No 300 ms debounce:
   the key makes the server safe and the existing `logging` flag stays.
9. **Fallback when `randomUUID` is missing** (plain-HTTP origin on a phone): build the key from
   `Date.now()` and `Math.random()`. Uniqueness only has to hold per profile and per tap.

## Split (GUARDRAILS: L becomes M or smaller)

Two sub-Issues, filed `ready`, `Split from #339`; #339 stays open as the parent and closes with the second PR.

- **A. Backend key and migration, effort:M.** Order first: it is inert until the client sends a key.
  - Migration v9 with the guarded `ALTER` and the index; `SCHEMA_VERSION = 9`.
  - `SetIn.client_id`, `add_set` insert-or-return, the `409` on a cross-session key.
  - `_import_merge` drops `client_id`.
  - Docs: `AGENTS.md` schema line (v8 to v9), `docs/BACKUPS.md` note that restore needs no step.
  - Tests that fail without the change: *a repeated client_id writes one row and returns the original*;
    *the same client_id from another profile writes its own row*; *a client_id reused on another
    session answers 409*; *migrating a v8 database adds the column and index and keeps its rows*;
    *init twice is a no-op*; *a v8 envelope restores*; *a v9 envelope round-trips client_id*;
    *merging an export into its own profile still succeeds*.
  - `Changelog: none` (no visible change yet).
- **B. Client key and announcement, effort:S.** Merges after A.
  - Key ref and clearing rules in `Workout.jsx`; the live region.
  - Tests: *a double-tap logs one set* (two taps before the first response resolves, one POST
    carries the key and the second is the same key or never sent); *a retry after a network failure
    reuses the key*; *a change of reps starts a new key*; *a successful log is announced in a live region*.
  - One entry in `frontend/src/lib/changelog.json`. Browser check at phone width.

## Deploy gate (not part of this plan's PRs)

Schema change. Before anyone deploys A: an admin `GET /api/export` snapshot, then a restore drill
against a copy (`docs/BACKUPS.md`), then `preflight.sh` and `deploy.sh`. B can follow in the same
deploy. The owner decides when.

## Out of scope

Backfilling or removing duplicates already in the data; a debounce; deduplicating `events`.
