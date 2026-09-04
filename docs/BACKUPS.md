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

`POST /api/import` is destructive by design: it wipes and replaces every table. Before
it touches anything it runs `VACUUM INTO` to `data/pre-import-<timestamp>.db`.

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
`exported_at`. `POST /api/import` consumes it, requiring `mode="replace"` and
`confirm=true` so it cannot fire by accident.

**Take one before any schema-changing deploy.** The runbook says so and the deploy
script does not do it for you.

Envelope compatibility is explicit rather than accidental: `TABLE_INTRODUCED_AT` records
the schema version each table first appeared at, so an envelope only has to contain the
tables that existed when it was written. An old backup stays importable as new tables
are added — a property that gets re-broken easily, so it has regression tests.

### 4. Scheduled snapshots — local, then off-site (weekly)

`scripts/backup.sh`, from cron on the host. One chain:

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

Retention: 90 days locally (~13 weekly snapshots); off-site keeps everything
(`REMOTE_KEEP_DAYS` unset — a year of weeklies is around 10 MB).

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

`backup.sh` writes `data/backup-status.json` next to the database; `/api/health` reads
it. Deliberately a file rather than an API call: the status no longer lives *inside* the
database being backed up (a restore used to drag stale heartbeats back in), and there's
no unauthenticated write endpoint to defend.

A successful backup older than 8 days reports `stale` — the weekly period plus a day of
grace. That threshold must move if the schedule does. Left at the old nightly 26h it
would have read `stale` every single day, and **a signal that is always red is one people
stop reading** — which is exactly how three consecutive nights of failed off-site backups
went unnoticed in September 2026.

`/api/health` is a **pull** signal. It only works when someone looks. `HEARTBEAT_URL` in
`backup.sh` is the hook for an external receiver that would actively notify — currently
unused.

## Restore

Two paths, both documented with real commands in `AGENTS.local.md`:

1. **`POST /api/import`** with a previously exported envelope. Auto-snapshots first.
2. **File-level swap** of `workouts.db` with a `VACUUM INTO` snapshot, container stopped.

**Re-drill a restore after any schema change.** The import path is the most
safety-critical code in the app and the one least exercised in normal use.

## Known gaps

Tracked, not forgotten:

| Gap | Issue |
|---|---|
| Backup status conflates the local and off-site legs, so an off-site failure masks the state of the local snapshot | #93 |
| Off-site copies unreliable until the Google OAuth app is published — token expires every 7 days in *Testing* status | #94 |
| No active alerting; failure is only visible if someone checks `/api/health` | #89 |

The honest current position: **local snapshots are reliable, off-site is best-effort.**
Level 4's local half runs weekly and works; its off-site half is expected to fail most
weeks until #94 is done. Levels 2 and 3 are unaffected.
