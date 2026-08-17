# Profiles migration — blast radius

**Date:** 2026-08-17 · **Type:** read-only investigation · **Status:** findings only, no design

This document establishes what is **true about the code today** and what would **mechanically**
have to change to add profiles. It deliberately does **not** answer the product questions
(owner vs. label, gate vs. switcher, emoji vs. avatar) — those are settled in brainstorming.
Every claim carries a `file:line`.

Claims marked **[probed]** were verified empirically against a throwaway SQLite DB in a
scratchpad (SQLite 3.50.4 / Python 3.14 — the container is `python:3.11-slim`,
`Dockerfile:18`; the behaviours probed are long-stable SQLite/`sqlite3` semantics). No repo
file, schema, or config was modified.

---

## Summary — the five things that matter

1. **Adding `profiles` to the `TABLES` list (`backend/main.py:10`) makes every export ever
   taken un-importable.** `/api/import` hard-requires every name in `TABLES` to be present in
   the envelope (`backend/main.py:413`) — a pre-migration envelope has four table keys, the
   gate would demand five, and the answer is `400 "envelope missing expected tables"`. The
   artifact `AGENTS.md:104-107` *mandates* you capture before this exact deploy is the artifact
   this change bricks.

2. **A foreign key from `sessions.profile_id` to `profiles(id)` breaks the import loop, and
   the most natural fix breaks it worse — silently.** The loop interleaves
   `DELETE FROM t` then inserts, per table (`backend/main.py:438-447`), with
   `PRAGMA foreign_keys=ON` (`backend/main.py:28`). **[probed]** With a plain FK, *both*
   table orderings fail with `FOREIGN KEY constraint failed`. With `ON DELETE CASCADE` and
   `profiles` last in `TABLES`, the import returns **HTTP 200 with correct-looking counts and
   an empty database** — the final `DELETE FROM profiles` cascade-wipes everything just
   restored, and the response counts come from the envelope, never from the DB
   (`backend/main.py:453`).

3. **`/api/import` rolls `PRAGMA user_version` *backwards*** to the envelope's value
   (`backend/main.py:448`). Restoring a pre-migration (v2) envelope into the v3 app leaves a
   DB stamped v2 with v3 columns. Migrations only run at process start (`backend/main.py:91`),
   so the lie persists until the next restart, at which point the v3 step re-runs and **must**
   be idempotent — `init()` is at module scope, so a raising migration means the app does not
   boot at all.

4. **`exercise_notes` cannot be migrated with a guarded `ALTER`.** Its primary key is
   `exercise_id` alone (`backend/main.py:83`) and the note upsert names it as the conflict
   target (`backend/main.py:262-264`). **[probed]** SQLite refuses
   `ADD COLUMN … PRIMARY KEY` and `ADD COLUMN … UNIQUE`, and `ON CONFLICT(exercise_id)`
   raises `ON CONFLICT clause does not match any PRIMARY KEY or UNIQUE constraint` once the
   PK is composite. This one table needs a full 12-step rebuild, breaking the project's
   established "guarded ALTER" convention.

5. **The dangerous read set is `GET /api/sessions` (`backend/main.py:159`), because of what
   the frontend does with it.** `findActiveSession` takes the first incomplete session in that
   global list (`frontend/src/lib/activeSession.jsx:6`) and `ResumeBanner`'s discard issues
   `DELETE /api/sessions/{id}` (`frontend/src/lib/activeSession.jsx:32`). Unfiltered, profile A
   is offered profile B's live workout and a one-tap button that **deletes it and its sets**
   (`backend/main.py:194-195`). Cross-profile destruction, not just leakage.

---

## 1. The migration mechanism as built

### Where it lives

- `_migrate(conn)` — `backend/main.py:37-59`
- `_column_exists(conn, table, col)` — `backend/main.py:34-35`
- `init()` — `backend/main.py:61-89`, called unconditionally at import time (`backend/main.py:91`)

### Current version: 2

`_migrate` reads the version **once** into `v` (`backend/main.py:38`) and then evaluates each
step as an independent `if v < N` (`backend/main.py:41`, `backend/main.py:45`), so a DB at any
older version walks the whole ladder in a single pass. The last step sets
`PRAGMA user_version = 2` (`backend/main.py:59`). `backend/test_foundations.py:40` asserts the
DB lands on 2, and `backend/test_foundations.py:89` asserts `/api/export` reports
`schema_version == 2`.

### The two existing steps, and the conventions they establish

**v0 → v1** (`backend/main.py:41-43`): add `sessions.ended_at`, guarded by `_column_exists`.
The comment states why — production DBs already had the column before versioning existed
(`backend/main.py:39`). `backend/test_foundations.py:24-40` locks this in: it rebuilds
`sessions` with `ended_at` already present, resets `user_version` to 0, and asserts `init()`
does not raise `duplicate column name`.

**v1 → v2** (`backend/main.py:45-59`): `CREATE TABLE IF NOT EXISTS events` plus four
`CREATE INDEX IF NOT EXISTS` statements, then the version bump.

The conventions, stated plainly:

| Convention | Evidence |
|---|---|
| **Baseline DDL is frozen.** `init()`'s `executescript` (`backend/main.py:63-87`) still describes the *original* three tables. It has never been amended — `ended_at` and `events` exist only inside `_migrate`. | `backend/main.py:63-87` vs. `backend/main.py:41-59` |
| **A fresh DB is built by replaying the ladder**, not by an up-to-date baseline. New install → `init()` creates 3 tables → `_migrate` sees `v=0` → adds `ended_at`, creates `events` + indexes → stamps 2. | `backend/main.py:88` |
| **Every statement is independently idempotent** — `IF NOT EXISTS` or an explicit `_column_exists` guard. Never a bare `ALTER`. | `backend/main.py:41`, `47`, `55-58` |
| **Version is set absolutely, not incremented** (`PRAGMA user_version = N`, not `= v+1`). | `backend/main.py:43`, `59` |
| **The version bump is the last statement of its step.** | `backend/main.py:43`, `59` |
| **Migrations run on every process start**, before any request is served. | `backend/main.py:91` |

### How a new step is added

Append to `_migrate` after `backend/main.py:59`:

```
if v < 3:
    <guarded, idempotent DDL>
    conn.execute("PRAGMA user_version = 3")
```

…and update `backend/test_foundations.py:40` (`== 2`), `backend/test_foundations.py:89`
(`== 2`), and `backend/test_foundations.py:88` (the exact table-key set) — see §7.

### The atomicity caveat nobody has had to care about yet

**[probed]** DDL and `PRAGMA user_version` execute in **autocommit** under Python's `sqlite3`
when no DML transaction is open: after `ALTER TABLE`, `conn.in_transaction` is `False`, and
both the new column and a `PRAGMA user_version = 7` survive a `close()` with no `commit()`.
The `conn.commit()` at `backend/main.py:89` is therefore decorative for the migration's DDL.

Consequences for a v3 step:

- A multi-statement migration **can partially apply**. Both existing steps are safe under
  this because every statement is re-runnable and the version bump is last — that is precisely
  *why* the convention exists.
- A v3 step that mixes DDL with a **backfill `UPDATE`** has mixed atomicity: the `UPDATE` opens
  an implicit transaction, subsequent DDL joins it, and it commits at `backend/main.py:89`.
  A crash between an autocommitted `ALTER` and an uncommitted backfill leaves the column present
  and unpopulated — the re-run must tolerate that, which a bare `UPDATE … WHERE profile_id IS NULL`
  does but a `NOT NULL DEFAULT` backfill silently masks.
- There is **no rollback path** and no automatic pre-migration snapshot. `AGENTS.md:104-107`
  is the *only* safety net, and it is a manual `curl` the operator must remember.

### SQLite limits that constrain any v3 step — all **[probed]**

| Attempted DDL | Result |
|---|---|
| `ADD COLUMN profile_id INTEGER NOT NULL DEFAULT 1 REFERENCES profiles(id)` | **FAILS** — `Cannot add a REFERENCES column with non-NULL default value` |
| `ADD COLUMN profile_id INTEGER REFERENCES profiles(id)` (nullable) | OK |
| `ADD COLUMN profile_id INTEGER NOT NULL DEFAULT 1` (no FK) | OK |
| `ADD COLUMN profile_id INTEGER NOT NULL` (no default) | **FAILS** — `Cannot add a NOT NULL column with default value NULL` |
| `ADD COLUMN … PRIMARY KEY` | **FAILS** — `Cannot add a PRIMARY KEY column` |
| `ADD COLUMN … UNIQUE` | **FAILS** — `Cannot add a UNIQUE column` |

**The load-bearing consequence:** you cannot have a declared foreign key *and* a non-null
backfilled default in one `ALTER`. It is either a nullable FK column (then existing rows are
orphans until an explicit `UPDATE`), or a `NOT NULL DEFAULT 1` column with **no** FK
(referential integrity becomes a convention, not a constraint), or a full table rebuild.
`PRAGMA foreign_keys=ON` is set on every connection (`backend/main.py:28`) and
`backend/test_foundations.py:8` asserts it, so the first restriction is always in force.

---

## 2. Every table, and whether it needs an owner column

Four tables exist. All are in `TABLES` (`backend/main.py:10`).

### `sessions` — `backend/main.py:64-70` (+ `ended_at`, `backend/main.py:42`)

Columns: `id`, `date`, `workout_day`, `completed`, `created_at`, `ended_at`.

**Needs an owner column.** It is the root of the ownership tree: every read of user training
data reaches it. `list_sessions` (`backend/main.py:162`) is unqualified, and everything
downstream — progress (`backend/main.py:227`), recency (`backend/main.py:319`), PRs
(`backend/main.py:339`, `343`), last-performance (`backend/main.py:277-278`) — joins through
it with `s.completed = 1` and nothing else. If `sessions` is not partitioned, nothing is.

Note `id INTEGER PRIMARY KEY AUTOINCREMENT` (`backend/main.py:65`) is a **single global id
space**. Session ids stay guessable and directly addressable across profiles, which is what
makes the path-parameter endpoints in §3 an ownership problem rather than a filtering problem.

### `sets` — `backend/main.py:71-81`

Columns: `id`, `session_id`, `exercise_id`, `exercise_name`, `set_number`, `reps`, `weight_kg`,
`logged_at`. FK `session_id → sessions(id) ON DELETE CASCADE` (`backend/main.py:80`).

**Does not strictly need one — ownership is derivable** via `session_id`, and every existing
query already joins to `sessions` to get it (`backend/main.py:227`, `243-245`, `318-319`,
`338-339`, `342-343`). Adding a denormalised `sets.profile_id` is an optimisation, and it buys
a new failure mode: a set whose `profile_id` disagrees with its session's, with no constraint
preventing it (SQLite has no cross-row CHECK). The one place it would genuinely help is
`session_prs`, which pulls **all** completed sets across the whole history in one flat query
(`backend/main.py:337-339`) — see §5.

### `exercise_notes` — `backend/main.py:82-86`

Columns: `exercise_id` (**PRIMARY KEY**), `note`, `updated_at`.

**Needs an owner column if notes are per-person, and this is the hard one.** Today the PK
forces exactly one note per exercise globally, and the upsert targets that PK by name
(`backend/main.py:262-264`). Two profiles both writing a note on `bench_press` means the second
`PUT /api/exercises/{exercise_id}/note` (`backend/main.py:256`) **overwrites the first** —
silently, with a 200 and the new note echoed back (`backend/main.py:268`).

**[probed]** Making the PK composite is not an `ALTER`:

- `ALTER TABLE … ADD COLUMN … PRIMARY KEY` → `Cannot add a PRIMARY KEY column`
- `ALTER TABLE … ADD COLUMN … UNIQUE` → `Cannot add a UNIQUE column`
- With `PRIMARY KEY (profile_id, exercise_id)`, the existing
  `ON CONFLICT(exercise_id) DO UPDATE` raises
  `ON CONFLICT clause does not match any PRIMARY KEY or UNIQUE constraint`

So this table requires the SQLite 12-step rebuild (create shadow table → copy with backfill →
drop → rename), and `backend/main.py:262-264` must change its conflict target in the **same
deploy** or every note save 500s. `exercise_notes` has no FK in either direction
(`backend/main.py:82-86`), so the rebuild does not need `PRAGMA foreign_keys=OFF`.

`get_notes` returns a flat `{exercise_id: note}` dict (`backend/main.py:254`), consumed as such
by `frontend/src/pages/Workout.jsx:120` — that shape survives partitioning unchanged, which is
convenient.

### `events` — `backend/main.py:46-54`

Columns: `id`, `name`, `screen`, `props`, `ts`.

**Must NOT require an owner column.** This table is dual-purpose:

1. **User telemetry** — posted by `frontend/src/lib/analytics.js:23` → `backend/main.py:373`.
2. **Infrastructure heartbeats** — `scripts/backup.sh:46` `curl`s `POST /api/events` from the
   Pi's host cron with `backup_completed` / `backup_failed`, and `/api/health` reads exactly
   those two names back (`backend/main.py:128-130`) to compute `last_backup_status`, including
   the >26h staleness rule (`backend/main.py:141`).

The cron `curl` has no session, no browser, and no profile. If a migration makes `profile_id`
`NOT NULL` without a default, heartbeat ingestion breaks and `/api/health` reports `"none"`
forever (`backend/main.py:146`) — and `AGENTS.md:126-133` tells the operator to treat that as a
deploy failure. A **nullable** owner column is the only shape that works here, and
`/api/health` and `/api/analytics/summary` (`backend/main.py:385`) must stay **unfiltered**
regardless.

### `profiles` — does not exist

A new table is required. Its mere existence is the single biggest compatibility hazard in this
change — see §4.

---

## 3. Every endpoint, and what it would need

19 routes plus a static mount (`backend/main.py:456-457`). Grouped by what partitioning does to
them.

### A. Would silently serve or mutate another profile's data if missed — **the dangerous set**

| Endpoint | Line | Query as written | What goes wrong, silently |
|---|---|---|---|
| `GET /api/sessions` | `159-163` | `SELECT * FROM sessions ORDER BY created_at DESC LIMIT 60` | **Worst one.** Feeds History (`frontend/src/pages/History.jsx:77`), Home (`frontend/src/pages/Home.jsx:67`) and `ActiveSessionProvider` (`frontend/src/lib/activeSession.jsx:22`). `findActiveSession` grabs the **first incomplete** session in the list (`frontend/src/lib/activeSession.jsx:6`) — so profile A is shown profile B's in-progress workout in the ResumeBanner, and the discard button calls `DELETE /api/sessions/{id}` (`frontend/src/lib/activeSession.jsx:32`), which deletes B's sets and session (`backend/main.py:194-195`). Also: `LIMIT 60` becomes a *shared* budget — a busy profile can push another profile's sessions off the end of History entirely. |
| `GET /api/sessions/{sid}` | `165-172` | `WHERE id = ?` | Any session id readable by any profile. 404s only when the row is absent (`backend/main.py:169-170`), never when it belongs to someone else. Used by History detail (`frontend/src/pages/History.jsx:85`) and Workout load (`frontend/src/pages/Workout.jsx:105`). |
| `PATCH /api/sessions/{sid}` | `174-189` | `UPDATE sessions … WHERE id = ?` | Marks another profile's session complete. Called on Finish Workout (`frontend/src/pages/Workout.jsx:240`). |
| `DELETE /api/sessions/{sid}` | `191-197` | `DELETE FROM sets …; DELETE FROM sessions …` | Destroys another profile's session and sets. Reached from History (`frontend/src/pages/History.jsx:99`) and the ResumeBanner discard. |
| `POST /api/sessions/{sid}/sets` | `199-209` | existence check only (`backend/main.py:202`) | Writes sets **into** another profile's session. The check at `202` asks "does it exist", never "is it mine". |
| `DELETE /api/sessions/{sid}/sets/{set_id}` | `211-216` | `WHERE id = ? AND session_id = ?` | Scoped to a session, not an owner. Returns `{"deleted": True}` unconditionally (`backend/main.py:216`) even when nothing matched. |
| `GET /api/progress` | `235-248` | `MAX(weight_kg) GROUP BY exercise_id` over all completed sessions | Merges everyone's bests into one number. Drives the Progress picker (`frontend/src/pages/Progress.jsx:28`) **and the Workout page's PR baseline** (`frontend/src/pages/Workout.jsx:123`). A beginner's app shows the strongest household member's max as their own baseline. |
| `GET /api/progress/{exercise_id}` | `218-233` | joins all completed sessions | One chart, two people's lifts interleaved by date — reads as wild volatility, not as an error (`frontend/src/pages/Progress.jsx:34`). |
| `GET /api/exercises/{exercise_id}/last` | `273-287` | `WHERE s.completed = 1 AND st.exercise_id = ? AND s.id != ?` | Prefills the Workout screen with the *other* person's last weights (`frontend/src/pages/Workout.jsx:98`). The one case with a physical-safety edge: it suggests a load the user has never lifted. |
| `GET /api/exercises/recency` | `289-331` | CTE partitioned by `exercise_id` only (`backend/main.py:314-317`) | Home's muscle-group recovery estimate (`frontend/src/pages/Home.jsx:69`). Another profile training chest makes *your* chest read as fatigued. Fails in the unsafe direction and is invisible — the output is a plausible number. |
| `GET /api/notes` | `250-254` | `SELECT exercise_id, note` | Everyone shares one note per exercise (`frontend/src/pages/Workout.jsx:120`). |
| `PUT /api/exercises/{exercise_id}/note` | `256-268` | upsert on `exercise_id` PK | Overwrites another profile's note, returns 200. |
| `GET /api/sessions/{sid}/prs` | `333-371` | three unscoped queries (`336`, `337-339`, `341-343`) | See §5 — the PR celebration at the end of every workout. Called at `frontend/src/pages/Workout.jsx:245`. |

That is **13 of 19 routes**. Every one of them fails *quietly*: a merged chart, a wrong
prefill, a stolen PR. None of them error.

### B. Needs the profile as *input*, not as a filter

| Endpoint | Line | Change |
|---|---|---|
| `POST /api/sessions` | `150-157` | Must stamp the owner on insert (`backend/main.py:153`). Called from `frontend/src/pages/Home.jsx:86`. `SessionIn` (`backend/main.py:94-98`) carries only `workout_day`. |

### C. Correctly stays global

| Endpoint | Line | Why |
|---|---|---|
| `GET\|HEAD /api/health` | `124-148` | Infrastructure. Reads `backup_completed`/`backup_failed` (`128-130`) written by host cron (`scripts/backup.sh:46`). Must never be profile-scoped or the backup monitor goes dark. |
| `POST /api/events` | `373-383` | Telemetry ingest, including cron heartbeats. A profile field, if any, must be optional. |
| `GET /api/analytics/summary` | `385-395` | Owner-facing usage stats across the whole install. |
| `GET /api/export` | `397-404` | Disaster recovery — must dump **everything**, all profiles. See §4. |
| `POST /api/import` | `406-453` | Disaster recovery — must restore **everything**. See §4. |
| static mount | `456-457` | SPA shell. |

### D. Two mechanical notes on adding routes

1. **No CORS middleware, deliberately** (`backend/main.py:16-18`). Any profile-selection call
   made from the SPA is same-origin and inherits that. There is no auth layer to hang ownership
   off — whatever carries the profile (header, query param, path prefix, cookie) is
   client-asserted and forgeable by construction. That is a *stated* property of this app, not
   a new hole, but the spec should say so out loud (matches the honest-scoping question at
   `docs/superpowers/backlog/2026-08-16-next-workstreams.md:86-89`).
2. **Route order is declaration order.** `GET /api/sessions/{sid}` (`backend/main.py:165`)
   declares `sid: int`. A later-declared literal like `/api/sessions/active` would be captured
   by it and 422. The existing `/api/exercises/{exercise_id}/last` (`273`) and
   `/api/exercises/recency` (`289`) do not collide only because they differ in segment count.
3. **The frontend has exactly one HTTP helper** (`frontend/src/api.js:3-11`), with no header
   or query-param injection point. Every one of the 20 call sites builds its own path string.
   A profile header would be a one-line change at `frontend/src/api.js:4-8`; a query parameter
   or path prefix touches all 20.

---

## 4. `/api/export` and `/api/import` — the disaster-recovery path

### What they are today

**Export** (`backend/main.py:397-404`) emits:

```
{ "exported_at": "<ISO Z>",          # backend/main.py:403
  "schema_version": <PRAGMA user_version>,   # backend/main.py:401
  "tables": { <name>: [ <row dicts> ] } }    # backend/main.py:402, for each name in TABLES
```

Rows come from `SELECT * FROM {t}` (`backend/main.py:402`) — **whatever columns exist**.
Downloaded by `frontend/src/lib/exportData.js:4`; captured pre-deploy per `AGENTS.md:104-107`.

**Import** (`backend/main.py:406-453`) gates in this order:

| # | Gate | Line |
|---|---|---|
| 1 | `mode == "replace"` and `confirm is True` | `408-409` |
| 2 | envelope is a dict with `tables` and `schema_version` | `411-412` |
| 3 | `tables` is a dict and **contains every name in `TABLES`** | `413-414` |
| 4 | `schema_version` parses as `int` | `415-418` |
| 5 | `env_version <= cur_version` (live `PRAGMA user_version`) | `420-422` |
| — | `VACUUM INTO` pre-import snapshot, prune to newest 3 | `425-435` |
| 6 | per row, `set(r.keys()) <= <live PRAGMA table_info columns>` | `439`, `442-443` |
| — | `PRAGMA user_version = env_version` | `448` |

Gate 6 is **asymmetric on purpose**: fewer columns than live is fine (defaults apply), more is
fatal (`backend/test_foundations.py:123-130`). And gate 5 compares against the **live DB's**
version, not a constant in the code.

### What changes in the envelope shape

| Change | Effect on the envelope | Code change needed |
|---|---|---|
| `sessions.profile_id`, `sets.profile_id` | Rows gain a key. **Automatic** — `SELECT *` at `backend/main.py:402`. | none |
| `exercise_notes` rebuilt with a composite PK | Rows gain a key. Automatic. | none |
| **New `profiles` table** | Only appears if `"profiles"` is added to `TABLES` (`backend/main.py:10`). | **one line — and it is the dangerous one** |
| `schema_version` | 2 → 3 automatically (`backend/main.py:401`). | none |

Everything is free except the `profiles` table, and that one line is where the compatibility
story dies.

### Backward compatibility, case by case

#### Case A — pre-migration envelope (v2) restored into the post-migration app (v3)

**This is the exact scenario `AGENTS.md:104-107` sets up.** The mandated pre-deploy snapshot
exists *precisely* so it can be restored if the deploy goes wrong.

- **If `profiles` was added to `TABLES`:** gate 3 (`backend/main.py:413`) fails —
  `400 "envelope missing expected tables"`. **Every export ever taken becomes un-importable
  through the API, including the one taken minutes earlier as the safety net for this deploy.**
  The `.db` backups on Drive still restore via the file path (`AGENTS.md:196-198`), so data is
  not lost — but the documented API restore (`AGENTS.md:192-195`) is dead, discovered at the
  worst possible moment.
- **If `profiles` was NOT added to `TABLES`:** the import proceeds and never touches the
  `profiles` table (it is not in the loop at `backend/main.py:438`). Sessions and sets are wiped
  and reinserted while the profile roster survives untouched — coherent, but it means
  `/api/export` no longer captures the whole DB, so the JSON envelope stops being a complete
  backup. Silent divergence between the two documented restore paths.
- **Row inserts:** old rows have no `profile_id` key, so gate 6 passes (subset). They insert
  with the column default. **[probed]** With `NOT NULL DEFAULT 1` they land on profile 1; with
  a nullable column they land as `NULL` and become invisible to every filtered query — the app
  comes up looking **empty** after a successful-reporting restore.
- **Version rollback:** `backend/main.py:448` sets `PRAGMA user_version = 2` on a v3 schema.
  Migrations only run at process start (`backend/main.py:91`), so nothing repairs it until a
  restart. At that restart the v3 step re-runs against an already-migrated schema. The guarded
  `ALTER` convention (`_column_exists`, `backend/main.py:34-35`) handles the column adds — but
  an `exercise_notes` **table rebuild** re-run must be guarded too, or it either raises (app
  fails to boot — `init()` is module-scope) or destroys the just-restored notes.

#### Case B — post-migration envelope (v3) restored into a rolled-back app (v2 image)

`AGENTS.md:284-288` documents image rollback as the standard revert. Rolling the **image** back
does not roll the **DB** back.

- Gate 3: old code's `TABLES` has 4 names; the envelope has 5. `any(t not in env["tables"])`
  is False → **passes**, extra key ignored.
- Gate 5: `cur_version` is read from the live DB (`backend/main.py:420`), which is still **3**.
  `3 > 3` is False → **passes**. **The version guard does not protect the downgrade case at
  all**, because nothing lowers `user_version` when an image is rolled back.
- Gate 6: `valid` comes from live `PRAGMA table_info` (`backend/main.py:439`), which still has
  `profile_id` → **passes**.
- **Result: HTTP 200.** Sessions/sets/notes/events restore with their `profile_id` values, and
  the `profiles` table is **never restored** — the old `TABLES` does not include it. Every row
  now points at a profile roster that was left at whatever the live DB happened to hold. If a
  real FK is declared, the insert fails and the whole import rolls back (`450-452`) with the
  generic `"import failed; rolled back"` message. If no FK, it succeeds silently and the
  profile column is dangling.
- The guard only behaves correctly if the **DB file** was also restored to a v2 snapshot
  (`cur_version = 2`, `3 > 2` → `400 "envelope schema_version newer than app"`).

#### Case C — the lying envelope

After Case A, the DB is stamped v2 with a v3 schema. An export taken in that window
(`backend/main.py:401-402`) reports `"schema_version": 2` while its rows carry `profile_id`.
Re-imported into the same app it works (gate 5 passes at 2 ≤ 2, gate 6 passes because the live
schema still has the column). Imported into a **genuine** v2 install it passes gate 5 (2 > 2 is
False) and dies at gate 6, surfacing the generic
`400 "import failed; rolled back, live DB unchanged"` (`backend/main.py:452`) — safe, but the
message points nowhere near the real cause, during an actual outage.

### The FK-vs-import-loop interaction — **[probed]**, and the worst finding in this document

The loop is `for t in TABLES: DELETE FROM t; <insert that table's rows>`
(`backend/main.py:438-447`), inside one transaction (`437`), with `PRAGMA foreign_keys=ON`
(`backend/main.py:28`). Deletes and inserts are **interleaved per table**, not batched.

This works today only because `TABLES` order is load-bearing luck: `sessions` precedes `sets`
(`backend/main.py:10`) and `sets.session_id` cascades (`backend/main.py:80`), so
`DELETE FROM sessions` clears `sets` too, sessions reinsert, then `DELETE FROM sets` is a no-op
and sets reinsert against parents that already exist.

Adding an FK-constrained `profiles` breaks that. Probed, restoring a valid 1-profile /
1-session / 1-set envelope:

| `sessions.profile_id` FK | `profiles` position in `TABLES` | Result |
|---|---|---|
| `REFERENCES profiles(id)` (NO ACTION) | first | **FAIL** `FOREIGN KEY constraint failed` — `DELETE FROM profiles` violates the live session still referencing it |
| `REFERENCES profiles(id)` (NO ACTION) | last | **FAIL** `FOREIGN KEY constraint failed` — same delete, now at the end |
| `… ON DELETE CASCADE` | first | **OK** — profiles wiped first, cascading sessions+sets away, then all three reinsert in order |
| `… ON DELETE CASCADE` | **last** | **"OK" — HTTP 200, `profiles=1, sessions=0, sets=0`** |

That last row is the disaster. The final `DELETE FROM profiles` cascade-deletes everything
restored moments earlier. The endpoint reports success with the **envelope's** counts, not the
database's (`backend/main.py:453`), so the operator sees
`{"restored": {"sessions": 42, "sets": 700, …}}` over an **empty database**. `test_import_round_trip`
would not catch it either — it re-exports and compares (`backend/test_foundations.py:107-109`),
which *would* fail, but only if `profiles` is in `TABLES` and the fixture seeds a profile.

Both `PRAGMA defer_foreign_keys=ON` inside the transaction and declaring no FK at all make every
ordering pass (probed) — noting the mechanism, not choosing it.

### Also true of the import path

- The pre-import `VACUUM INTO` snapshot (`backend/main.py:425-428`) runs **before** any gate-6
  work but **after** gates 1-5, so a gate-3 rejection produces no snapshot. Pruning to the
  newest 3 (`backend/main.py:11`, `431-435`) runs on failed imports too
  (`backend/test_review_fixes.py:146-155`). **Three failed restore attempts during a panic can
  evict the snapshot of the good DB.**
- Rollback on failure (`backend/main.py:450-452`) covers the DML only. `PRAGMA user_version`
  at `448` is inside the same transaction and rolls back with it — but any autocommitted DDL
  would not, which is why migrations must never run inside an import.

---

## 5. PR and progress queries under partitioning

### `session_prs` — `backend/main.py:333-371`

Three unscoped queries feed it:

| Query | Line | Scope today | Under profiles |
|---|---|---|---|
| current session's sets | `336` | `WHERE session_id = ?` | Correct by construction — but only if the caller is allowed to read `sid` at all (§3). |
| **all prior completed sets, everywhere** | `337-339` | `WHERE s.completed = 1 AND s.id != ?` | **Must be scoped.** This is the comparison baseline for weight PRs (`355-357`), rep PRs (`359-362`) and Epley 1RM PRs (`363-365`). Unscoped, a beginner is measured against the strongest person in the house and **never earns a PR**. |
| **all completed session volumes** | `341-343` | `GROUP BY st.session_id` over all completed | **Must be scoped.** Drives the volume PR (`367-370`). Same failure: the household's heaviest session is everyone's bar. |

Two further effects, both subtle:

- **The `baseline` marker inverts.** `backend/main.py:351-353` emits a muted `baseline` instead
  of a fake celebration when an exercise has no prior history. Unscoped, a *new* profile's first
  ever bench press finds another profile's bench sets in `prior`, so it is **not** treated as a
  baseline — it is silently judged a non-PR. That is exactly the failure the 2026-06-30 PR
  baseline work was built to prevent
  (`docs/superpowers/backlog/2026-08-16-next-workstreams.md:26-31`).
- **Cost.** `prior` (`337-339`) pulls **every completed set in the database** into Python and
  filters it per-exercise in a list comprehension (`backend/main.py:350`). On a Pi 3 B+ this is
  already the heaviest endpoint; multi-profile data makes it grow faster while each profile uses
  a shrinking slice. Filtering in SQL by profile makes it *cheaper*, and a `sets.profile_id`
  column would let `337-339` skip the `sessions` join entirely — the strongest argument for
  denormalising (§2).

### `all_progress` — `backend/main.py:235-248`

`MAX(st.weight_kg) GROUP BY exercise_id, exercise_name` across all completed sessions. Needs the
profile in the `WHERE`. Two consumers, and the second is easy to forget: the Progress picker
(`frontend/src/pages/Progress.jsx:28`) **and the Workout page's PR baseline**
(`frontend/src/pages/Workout.jsx:123`) — the comment at `backend/main.py:238-240` explains it
exists to avoid a per-exercise fan-out. Unscoped, the in-workout "you're near your PR" hint uses
someone else's max.

### `get_progress` — `backend/main.py:218-233`

Per-exercise series, completed sessions only, `LIMIT 60` applied **inside** the subquery
(`230`) before re-sorting ascending (`231`). The profile predicate must go in the **inner**
`WHERE` (`228`) alongside `st.exercise_id = ? AND s.completed = 1`. Filtering after the fact
would return fewer than 60 points from a 60-row shared window — a chart that silently truncates
history. The same trap exists at `backend/main.py:162` (`LIMIT 60` on `list_sessions`).

### `exercises_recency` — `backend/main.py:289-331`

The `ROW_NUMBER() OVER (PARTITION BY st.exercise_id ORDER BY s.date DESC, s.id DESC)` window
(`314-317`) and the `rn = 1` / `rn = 2` self-join (`326-328`) compute "last time" and "time
before that" per exercise. Under profiles the partition key must become
`(profile_id, exercise_id)` **and** the `WHERE` must filter — partitioning alone would still let
another profile's row take `rn = 1`. Feeds the Home recovery estimate
(`frontend/src/pages/Home.jsx:69`); the endpoint's own comment (`backend/main.py:294-297`)
already flags that its errors run in the "reads fresher than it is" direction, and cross-profile
contamination runs the **opposite** way — it reads *more fatigued* than reality, suppressing
training suggestions.

### `last_performance` — `backend/main.py:273-287`

`ORDER BY s.created_at DESC LIMIT 1` over completed sessions (`277-281`), then that session's
sets (`284-286`). Needs the profile in the first `WHERE`. Note it already has an exclusion
parameter (`exclude_session`, `backend/main.py:274`, used at
`frontend/src/pages/Workout.jsx:98`) — a precedent for threading an extra filter through, but it
defaults to `-1` when absent (`281`), i.e. **fails open**. A profile parameter that defaults to
"no filter" the same way would be an invisible leak.

---

## 6. What has to change beyond the backend queries

- **`frontend/src/api.js:3-11`** — the single `req()` helper has no place to inject a profile.
  20 call sites build paths by hand (§3.D.3).
- **`frontend/src/lib/activeSession.jsx:6`** — `findActiveSession` picks the first incomplete
  session from whatever `/api/sessions` returned. Pure function, trivially testable, and the
  hinge of the worst leak in §3.
- **`frontend/src/components/TopBar.jsx:12-36`** — where the owner wants the name/icon. Today it
  renders a hard-coded `🏋 Gym Tracker` (`24-26`) and a page label; it takes no props and reads
  no context.
- **`frontend/src/lib/useRestPreference.js:3-14`** is the only existing `localStorage` usage —
  the precedent for per-device persistence if the last-profile memory goes there.
- **`scripts/backup.sh:46`** posts heartbeat events with no profile context. Must keep working.

---

## 7. Test tripwires that will fire

| Test | Line | Why it breaks |
|---|---|---|
| `test_export_envelope_shape` | `backend/test_foundations.py:88` | Asserts the **exact** table-key set `{sessions, sets, exercise_notes, events}`. Adding `profiles` to `TABLES` fails it — a genuine tripwire, and a good one. |
| `test_export_envelope_shape` | `backend/test_foundations.py:89` | Asserts `schema_version == 2`. |
| `test_migrate_skips_realter_when_column_preexists` | `backend/test_foundations.py:40` | Asserts the ladder lands on 2. |
| `test_import_rejects_malformed_and_newer_schema` | `backend/test_foundations.py:120` | Hard-codes the 4-table list. **Would still pass — for the wrong reason**: with `profiles` in `TABLES` it 400s at gate 3 (`backend/main.py:413`) instead of the version gate (`420-422`) it exists to test. A silently vacuous test over the exact guard this migration depends on. |
| `test_import_rejects_non_numeric_schema_version` | `backend/test_foundations.py:134` | Same hard-coded list, same vacuous-pass hazard. |
| `test_import_round_trip` | `backend/test_foundations.py:100-109` | The only end-to-end restore check. Re-exports and compares `sessions`/`sets` — it would catch the cascade-wipe in §4 **only if** a profile row is seeded and `profiles` is in `TABLES`. |

`conftest.py:8-13` reloads `main` per test to re-run `init()` against a temp DB, so migration
behaviour is testable without a live DB — the v3 step can and should get the same treatment
`ended_at` got at `backend/test_foundations.py:24-40`.

---

## 8. Ranked risks — worst first

### R1. Adding `profiles` to `TABLES` bricks every existing export, including the mandated pre-deploy snapshot
`backend/main.py:10` + `backend/main.py:413`.
**In production:** the deploy misbehaves, the operator reaches for the
`pre-deploy-2026-XX-XX.json` that `AGENTS.md:104-107` told them to take, POSTs it per
`AGENTS.md:192-195`, and gets `400 "envelope missing expected tables"`. The safety net that
justified the whole ceremony does not exist. Recovery falls back to the file path
(`AGENTS.md:196-198`) and a `.db` from Drive — slower, requires container stop/start, and loses
everything logged since the last nightly.

### R2. FK + `ON DELETE CASCADE` with `profiles` last in `TABLES` = HTTP 200 over an empty database
`backend/main.py:438-447` (interleaved delete/insert), `backend/main.py:28` (FKs on),
`backend/main.py:453` (counts from the envelope, not the DB). **[probed]**
**In production:** a real restore returns `{"restored": {"sessions": 42, "sets": 700, ...}}`.
The operator sees success and moves on. The app is empty. The pre-import snapshot
(`backend/main.py:426-428`) is the only surviving copy — and if this is attempt three of a panic,
pruning (`backend/main.py:431-435`, keep 3) may already have eaten the good one. **Silent total
data loss on the disaster-recovery path.** Worse than R1 because R1 fails loudly.

### R3. `GET /api/sessions` unfiltered → the ResumeBanner offers a one-tap delete of someone else's live workout
`backend/main.py:159-163` → `frontend/src/lib/activeSession.jsx:6` →
`frontend/src/lib/activeSession.jsx:32` → `backend/main.py:194-195`.
**In production:** two household members train the same evening. A opens the app mid-B's
session, sees "You have a workout in progress", taps Discard, and B's sets are gone with no
undo. Presents to the user as data loss, not as a bug.

### R4. `/api/import` rolls `user_version` backwards, and the re-run of the migration is what boots the app
`backend/main.py:448`, `backend/main.py:91`.
**In production:** restore a v2 envelope into the v3 app → DB stamped v2, schema v3. Next
`docker compose up -d`, `_migrate` replays the v3 step. If any part is not idempotent — most
plausibly an `exercise_notes` table rebuild, which cannot use the `_column_exists` guard the
same way — `init()` raises at module scope and **the container will not start**. Total outage
immediately after a restore, i.e. exactly when the operator is already in trouble.

### R5. The version guard does not protect image rollback
`backend/main.py:420-422` compares against the live DB, and rolling the image back does not
lower `user_version`.
**In production:** revert to the previous image per `AGENTS.md:284-288`, restore a v3 envelope,
get a 200, and the `profiles` table is never restored (not in the old `TABLES`). Sessions carry
`profile_id` values pointing at nothing. Re-deploy the new image and the profile roster is gone
while the data claims owners that do not exist.

### R6. Nullable `profile_id` + no backfill = an app that comes up empty after a "successful" migration
`backend/main.py:28` forces a nullable column if a real FK is wanted (**[probed]**:
`Cannot add a REFERENCES column with non-NULL default value`).
**In production:** migration completes, `/api/health` is green, the SHA matches — and Home,
History and Progress are all blank because every pre-existing row has `profile_id IS NULL` and
every query now filters. Looks like catastrophic data loss; the rows are all still there.

### R7. `exercise_notes` needs a table rebuild, and the upsert must change in the same deploy
`backend/main.py:83` (PK), `backend/main.py:262-264` (`ON CONFLICT(exercise_id)`). **[probed]**:
composite PK ⇒ `ON CONFLICT clause does not match any PRIMARY KEY or UNIQUE constraint`.
**In production:** if the DDL ships and the query does not, **every note save 500s**
(`frontend/src/pages/Workout.jsx:120` reads them; the PUT is the write path). If the rebuild is
not re-runnable, R4 escalates from "app fails to boot" to "notes destroyed on second boot".

### R8. `session_prs` unscoped → PR detection quietly stops working for everyone but the strongest
`backend/main.py:337-339`, `341-343`, and the baseline branch at `backend/main.py:351-353`.
**In production:** a new profile logs their first month and never sees a single PR — their lifts
are compared against the household maximum — and never sees the muted `baseline` marker either,
because "prior history" is found for exercises they have never performed. No error, no log line;
it presents as "the app doesn't celebrate anything", the exact regression the 2026-06-30 work
was built to prevent.

### R9. `LIMIT 60` becomes a shared budget
`backend/main.py:162` (sessions) and `backend/main.py:230` (progress, applied **inside** the
subquery).
**In production:** with two active profiles, History silently shows ~30 of each and progress
charts truncate. If the profile filter is added *outside* the limit rather than in the inner
`WHERE`, this stays broken even after the endpoint "has been scoped" — a fix that looks correct
in review and is not.

### R10. `events` over-constrained → the backup monitor goes dark
`backend/main.py:128-130`, `scripts/backup.sh:46`, `backend/main.py:373-383`.
**In production:** a `NOT NULL` profile column on `events` makes the cron heartbeat POST fail
(silently — `scripts/backup.sh:46` ends in `|| true`). `/api/health` reports
`last_backup_status: "none"` forever, the >26h staleness alarm (`backend/main.py:141`) can never
fire, and nightly backup failures become invisible right after the one change in this project's
history that most needs working backups.

### R11. Failed-import snapshot pruning can evict the good snapshot during a panic
`backend/main.py:11` (keep 3), `backend/main.py:431-435`, and the deliberate choice to prune on
failure (`backend/test_review_fixes.py:146-155`).
**In production:** three failed restore attempts and the pre-import snapshot of the last-known-good
DB is gone. Pre-existing behaviour, but this migration is the first change likely to produce
several consecutive failed imports.

### R12. Migration steps are not atomic
**[probed]**: DDL and `PRAGMA user_version` autocommit; `backend/main.py:89`'s `commit()` does
not cover them.
**In production:** power loss mid-migration (a Pi with a confirmed under-voltage flag,
`docs/superpowers/backlog/2026-08-16-next-workstreams.md:47`) leaves a half-applied schema with
`user_version` still 2. Survivable only because every statement is written to be re-runnable —
which is a convention, not an enforced property, and R7's table rebuild is the first step that
does not naturally satisfy it.

---

## Appendix — verification method

`_column_exists`/`ALTER`/FK/upsert behaviours were confirmed by running four throwaway scripts
against temp SQLite files in the session scratchpad, not by reasoning from documentation. They
covered: `ADD COLUMN` restrictions (REFERENCES + non-null default, NOT NULL without default,
PRIMARY KEY, UNIQUE); the `/api/import` delete/insert loop under four FK × ordering combinations
plus `PRAGMA defer_foreign_keys`; `ON CONFLICT` against a composite primary key; and DDL /
`PRAGMA user_version` autocommit across a `close()` without `commit()`. No repo file was
modified, and no migration was written.
