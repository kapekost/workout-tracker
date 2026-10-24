# Backups and recovery

Canonical reference for how this project's data is protected, at every level that
exists. Machine-specific values — real host, paths, credentials, the exact restore
commands for *this* deployment — live in `AGENTS.local.md` (gitignored). This file
stays portable: the shape of the system, not one deployment's coordinates.

The only thing that genuinely matters here is `workouts.db`. Everything else — the
image, the repo, the container — is rebuildable from git in minutes. The database is
not.

## The levels

Five, roughly ordered from "cheapest and most frequent" to "last resort".

### 1. SQLite durability (continuous)

WAL journalling with `foreign_keys=ON` and a 5s busy timeout. Not a backup — it's what
makes the snapshots below internally consistent, and what stops a crash mid-write from
corrupting the file.

### 2. Pre-import auto-snapshot (on demand, automatic)

An admin's `POST /api/import` with `mode="replace"` is destructive by design: it wipes
and replaces every table. Before it touches anything it runs `VACUUM INTO` to
`data/pre-import-<timestamp>.db`. (A member's `mode="merge"` is additive and never
wipes anything, so it gets no such snapshot — see level 3 below.)

Two deliberate details worth not "simplifying" later:

- The snapshot is taken **outside** the transaction, since `VACUUM INTO` can't run
  inside one, and the filename carries microseconds so back-to-back imports can't
  collide.
- Pruning to the newest 3 happens **before** the import, not after — a *failed* import
  also leaves a snapshot behind, and pruning afterwards would let those accumulate
  unbounded.

This is the safety net for "I restored the wrong file". It is not a backup of anything
older than the moment you pressed import.

### 3. Manual export (on demand)

`GET /api/export` returns a JSON envelope: every table, plus `schema_version` and
`exported_at`. `POST /api/import` consumes it, requiring `confirm=true` so it cannot
fire by accident. Since #87 both endpoints are reachable by any authenticated profile,
but role decides their shape: an **admin** gets/consumes the *whole database*, and
`import` requires `mode="replace"`. A **member** gets/consumes only *their own rows*,
and `import` requires `mode="merge"` — additive, never a wipe. Either way a bare `curl`
from the host gets a 401 — log in first and send the `wt_session` cookie.

**Take one before any schema-changing deploy.** The runbook says so and the deploy
script does not do it for you.

Envelope compatibility is explicit rather than accidental: `TABLE_INTRODUCED_AT` records
the schema version each table first appeared at, so an envelope only has to contain the
tables that existed when it was written. An old backup stays importable as new tables
are added — a property that gets re-broken easily, so it has regression tests.

A column added to an existing table (`sets.client_id`) needs no such entry: export is
`SELECT *`, restore accepts any column the live table has, and an older envelope simply
leaves it `NULL`. A member's merge import drops `client_id` so the copies it adds cannot
collide with the originals.

### 4. Snapshots: local, then off-site (manual)

`scripts/backup.sh` is run by hand on the host, and before a risky change such as a schema
migration. No schedule is installed. The history: nightly until 2026-09-04, weekly for a
few hours, manual, daily from #422 on 2026-10-22, and manual again from 2026-10-24
(`docs/orchestration/DECISIONS.md`). A run whose database is unchanged does nothing, and
only the newest 2 snapshots stay on disk, so a run neither piles up files nor adds noise.
One chain:

```
VACUUM INTO (inside the container)
      ↓
docker cp to the host's staging dir
      ↓
rclone copy to the off-site remote
```

**Why `VACUUM INTO` inside the container:** the host's cron user can't read the
container's root-owned WAL sidecars, and copying a live WAL database from outside risks
a torn snapshot. Running it inside yields a consistent, already-compacted file.

**Why the staging dir is not `/tmp`:** that's tmpfs, which would wipe local retention on
every reboot.

**Why the ordering matters:** `rclone copy` runs *last*, after the snapshot is already
safely on the host's disk. That ordering is why an off-site outage still leaves you with
good local snapshots — proven in the 2026-09-01..04 Drive failure, where four "failed"
runs each produced a perfectly good local file. **Do not reorder this chain.**

**Skip when unchanged.** Before the chain, the script prints a fingerprint of the live
database (SHA-256 of the SQL dump, taken in the container, 16 hex characters). Each
snapshot's file name ends in the fingerprint it was taken at
(`workout-<timestamp>-<fingerprint>.db`), so the newest snapshot carries its own
fingerprint and no second state file can drift from it. If the two match, no snapshot is
written and the run records `local: skipped (unchanged)`. Otherwise it takes a full
`VACUUM INTO` snapshot: the database is small, so full snapshots are the recoverable
form and there is no WAL shipping or delta. The off-site `rclone copy` runs in both cases:
for a file Drive already has it does nothing, and after a failed upload it is the retry.

Since 2026-09-05 the two legs are also *reported* independently, which is what those four
nights actually cost us: the run above now exits 0 and records `local: ok` alongside
`remote: failed`, because the local snapshot is the copy standing between you and data
loss. Only a local failure exits non-zero.

Retention: the **newest 2** local snapshots, pruned at the end of every run (also the
older manual-era files, which sort in the same way). Off-site holds the **newest object**
only: after a successful upload the script lists the remote and deletes the others, but
only when the upload itself is in the listing.

**The off-site remote does not "keep everything", and it is worth understanding why.**
The rclone remote uses `scope = drive.file`, which grants access only to files that
*that OAuth client* created. It is not a view of the Drive folder; it is a view of one
app's own uploads. When the client_id changed on 2026-08-25, everything the previous
client had uploaded became invisible to rclone — still consuming Drive storage, but
unreachable from the command line and only findable in the Drive web UI. Only
files that client created are listed and pruned; anything older stays in Drive and
needs the web UI. Treat the off-site copy as "the last run's snapshot", not as an archive.

Housekeeping — pruning old snapshots and trimming the `events` table — runs *outside*
the success chain, so a prune hiccup can't flag a good backup as failed and an off-site
outage can't skip it.

### 5. Rebuild from scratch

If the host is lost entirely: the repo and image rebuild from git, but the database only
comes back from level 3 or 4. This has happened once for real (SD-card death, July
2026): the off-site copies survived because they live off-box, and were what made the
rebuild a restore rather than a loss.

**After any such event, check the off-site remote before assuming data is gone**, and
verify what you find (`PRAGMA integrity_check` plus row counts) before restoring it over
anything.

## Monitoring

`backup.sh` writes `data/backup-status.json` next to the database; `GET
/api/admin/backup-status` reads it. Deliberately a file rather than an API call: the
status no longer lives *inside* the database being backed up (a restore used to drag
stale heartbeats back in), and there's no unauthenticated write endpoint to defend.

Each leg gets its own entry, because each fails on its own:

```json
{
  "local":  {"status": "ok",     "at": "2026-09-05T00:12:03Z", "bytes": 172032},
  "remote": {"status": "failed", "at": "2026-09-05T00:12:09Z", "error": "rclone copy failed"}
}
```

`/api/admin/backup-status` surfaces both — `last_backup_status`/`last_backup_at` for the
local leg, `last_backup_remote_status`/`last_backup_remote_at` for the off-site one. The
local leg keeps the unprefixed names on purpose: it is the one that matters most.
Statuses are `ok`, `skipped (unchanged)`, `failed` or `stale` locally,
plus `skipped` off-site for "the local leg failed, so we never tried". `skipped (unchanged)`
is healthy: the database matched the newest snapshot, so no file was written. `failed` and
the off-site `skipped` never age into `stale`; only a run that went fine does (`ok` or
`skipped (unchanged)`), since relabelling the other two would lose the detail that
separates "ran and broke" from "never ran".

A remote leg of `null` means the file has nothing to say about it: no backup has run
yet, or the file predates this split (a pre-2026-09-05 file has a single top-level
status, which is read as the local leg). Unknown is not the same as failed.

A run (`ok` or `skipped (unchanged)`) older than 8 days reports `stale`: nobody has run a
backup for over a week. `failed` is the other one worth chasing: it means the chain ran and
broke. Neither fails a deploy, with one exception: a deploy that changes the schema version is
refused unless the last good backup is under 24 hours old or `DEPLOY_ALLOW_OLD_BACKUP=1` is set.
`DEPLOY_ALLOW_STALE=1` (the rollback path) skips that check along with the others.

The endpoint is admin-only since #86, when `/api/health` was trimmed to `{status,
version}`: `/api/health` is reachable without a session (it is the deploy smoke check)
and how long the database has gone without leaving the box is nobody else's business.
`scripts/deploy.sh` has no session and cannot get one, so it prints
`data/backup-status.json` off the host verbatim instead, plus how old the last good run is, so the
stale rule stays in one place (`BACKUP_STALE_AFTER_S` in `backend/main.py`).

The threshold follows the schedule: 8 days with none (the default), and the deployment sets
`BACKUP_STALE_AFTER_DAYS` (to about 2 for a daily cron) if it installs one. A threshold
tighter than the schedule would read `stale` every day. **A signal that is always red is
one people stop reading** — which is exactly how three consecutive nights of failed
off-site backups went unnoticed in September 2026.

The backup status is a **pull** signal. It only works when someone looks. That was the argument
for an external receiver, and `HEARTBEAT_URL` in `backup.sh` is still the hook for one.
#89 was closed because a manual backup has no schedule for a dead-man's-switch to alarm
against. A receiver only makes sense if a schedule comes back.

## Restore

Two paths, both documented with real commands in `AGENTS.local.md`:

1. **`POST /api/import`** with a previously exported envelope. Auto-snapshots first.
   Needs an admin session, and ends every session including yours — see
   "Break-glass" under Status in `AGENTS.md`.
2. **File-level swap** of `workouts.db` with a `VACUUM INTO` snapshot, container stopped.

A member's `mode="merge"` import (#87) is not a restore path and isn't a third option
here: it only adds rows to the importer's own profile, never wipes anything, gets no
pre-import snapshot, and doesn't end anyone's session. It also can no longer stand in
for path 1 by mistake — a member's own export contains no admin profile row, and the
app refuses to replace the database with an envelope that has none, so handing an
admin a member's exported file and restoring it no longer wipes every admin out of
existence.

**Re-drill a restore after any schema change.** The import path is the most
safety-critical code in the app and the one least exercised in normal use.

## What this covers, and what it doesn't

Everything above is about **`workouts.db`**. The host it runs on is shared with another
service that has its own, separate backup story — audited 2026-09-04, full detail (real
names, paths, commands) kept in `AGENTS.local.md`'s "Co-located services" section since
it isn't this app's to document publicly.

| What | Protection | Off-box? |
|---|---|---|
| **workout-tracker DB** | `scripts/backup.sh`, by hand; newest 2 local snapshots + the newest one off-site | Yes |
| **The co-located service** | Its own automatic backup, roughly monthly — now only off-box | Yes, by hand |
| **The host itself** | Nothing | **No** |

Two gaps worth naming rather than discovering later (see `AGENTS.local.md` for the
exact recovery commands):

- **The co-located service's backups live on the same SD card it runs on**, and nothing
  moves them automatically. The card dying would take them with it — the one failure
  this host has already had, in July 2026. The existing ones were copied off-box by hand
  and verified; each *new* one needs the same manual copy-off, or it stays on-card only.
- **There is no image or filesystem backup of the host.** No timeshift, rpi-clone,
  rsnapshot, borg, restic or duplicity is installed, and no cron or systemd timer does
  anything of the kind. Losing the card means rebuilding the OS and every service by
  hand. For workout-tracker that is fine — it rebuilds from git and its data is off-box.
  For the co-located service it is not: months of configuration and history live only
  there.

Neither is filed as an issue in this repo, because neither is this repo's to fix — the
host is shared infrastructure. They are recorded here so the honest answer to "what is
backed up?" isn't mistaken for "the app is backed up, so the box is".

## Password hashes are in every backup

The export envelope includes `profiles.password_hash` (owner decision, 2026-10-11: accepted, not
stripped). Treat every backup file as a credential store. An envelope that lacks hashes, such as one
from before passwords existed, restores with nobody able to log in; users then sign back in through
forgot-password, and the owner uses `scripts/bootstrap_owner.py`.

## Known gaps

Tracked, not forgotten:

| Gap | Issue |
|---|---|
| Backup status conflates the local and off-site legs, so an off-site failure masks the state of the local snapshot | #93 |

The honest current position for the database: **local snapshots are reliable, off-site is
one copy and best-effort.** The Google OAuth app was published on 2026-09-04 and the
remote verified working, which closed #94 and ended the weekly token expiry. Levels 2 and
3 are unaffected by any of it. Active alerting (#89) was closed as not planned: it needed a
schedule to alarm against, and none is installed.
