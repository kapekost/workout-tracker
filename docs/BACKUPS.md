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

### 4. Snapshots — local, then off-site (manual)

`scripts/backup.sh`, run by hand on the host. There is **no cron**: it was nightly
until 2026-09-04, weekly for a few hours, and then removed entirely — the app isn't
used enough for a schedule to earn its keep, and a manual run tells you its result
immediately instead of failing silently at 03:30. One chain:

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

Retention, as actually configured on 2026-09-04: **two** local snapshots, kept by hand,
and whatever is off-site. The `-mtime +90` prune in the script is only a backstop against
unbounded growth, not the policy — with no cadence there is nothing to size a window
against.

**The off-site remote does not "keep everything", and it is worth understanding why.**
The rclone remote uses `scope = drive.file`, which grants access only to files that
*that OAuth client* created. It is not a view of the Drive folder; it is a view of one
app's own uploads. When the client_id changed on 2026-08-25, everything the previous
client had uploaded became invisible to rclone — still consuming Drive storage, but
unreachable from the command line and only findable in the Drive web UI. As of
2026-09-04 the remote holds exactly **one** object. Treat the off-site copy as "the last
run's snapshot", not as an archive, and do any real housekeeping in the web UI.

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

A successful backup older than 8 days reports `stale`. With backups manual, read that as
"it has been over a week since you took one", not as a broken schedule — `scripts/deploy.sh`
prints it as a warning and does **not** fail the deploy over it. `failed` is the one worth
chasing: it means the chain ran and broke.

The threshold must move if a schedule ever comes back. Left at the old nightly 26h against
a weekly cron it would have read `stale` every single day, and **a signal that is always
red is one people stop reading** — which is exactly how three consecutive nights of failed
off-site backups went unnoticed in September 2026.

`/api/health` is a **pull** signal. It only works when someone looks. That was the argument
for an external receiver, and `HEARTBEAT_URL` in `backup.sh` is still the hook for one —
but a dead-man's-switch alarms on a ping that missed its *schedule*, and a manual backup has
none, so it would fire forever. #89 was closed for that reason; reinstate both together or
neither.

## Restore

Two paths, both documented with real commands in `AGENTS.local.md`:

1. **`POST /api/import`** with a previously exported envelope. Auto-snapshots first.
2. **File-level swap** of `workouts.db` with a `VACUUM INTO` snapshot, container stopped.

**Re-drill a restore after any schema change.** The import path is the most
safety-critical code in the app and the one least exercised in normal use.

## What this covers, and what it doesn't

Everything above is about **`workouts.db`**. The host it runs on is shared, and the other
two things living on it have a very different level of protection. Audited 2026-09-04:

| What | Protection | Off-box? |
|---|---|---|
| **workout-tracker DB** | `scripts/backup.sh`, run manually; 2 local snapshots + the last one off-site | Yes |
| **Home Assistant** | HA's own automatic backup, roughly monthly — now only off-box | Yes, by hand |
| **The Raspberry Pi itself** | Nothing | **No** |

Two gaps worth naming rather than discovering later:

- **Home Assistant's backups live on the same SD card as Home Assistant**, and nothing
  moves them automatically. The card dying would take them with it — the one failure this
  Pi has already had, in July 2026. The two that existed (~47 MB and ~65 MB, from
  2026-08-01 and 2026-09-01) were copied to `gdrive:homeassistant-backups` by hand on
  2026-09-04, verified byte-for-byte by comparing md5 sums computed independently on each
  side, and then **deleted from the card**. So they now exist off-box only, and
  `/config/backups` is empty until HA writes its next one. **That next one will not be
  copied anywhere**, until someone repeats this:

  ```bash
  # on the host — docker cp because the config volume is root-owned
  mkdir -p ~/ha-staging
  docker cp homeassistant:/config/backups/<file>.tar ~/ha-staging/
  rclone copy ~/ha-staging gdrive:homeassistant-backups
  rclone check ~/ha-staging gdrive:homeassistant-backups   # expect "0 differences found"
  rm -rf ~/ha-staging
  ```

  Verify before deleting anything — `rclone check`, or md5 both sides — because the point
  of the exercise is that these are the only copies. Note the tradeoff that comes with
  removing the originals: HA's own UI only lists backups present in `/config/backups`, so
  restoring now means pulling the tar back down from Drive first. That is the intended
  state here, not an oversight; disk space was never the reason (the Pi is 11% full with
  ~100 GB free), getting them off a card that has already died once was.
- **There is no image or filesystem backup of the Pi.** No timeshift, rpi-clone,
  rsnapshot, borg, restic or duplicity is installed, and no cron or systemd timer does
  anything of the kind. Losing the card means rebuilding the OS and every service by
  hand. For workout-tracker that is fine — it rebuilds from git and its data is off-box.
  For Home Assistant it is not: months of configuration and history live only there.

Neither is filed as an issue in this repo, because neither is this repo's to fix — the
Pi is shared infrastructure. They are recorded here so the honest answer to "what is
backed up?" isn't mistaken for "the app is backed up, so the box is".

## Known gaps

Tracked, not forgotten:

| Gap | Issue |
|---|---|
| Backup status conflates the local and off-site legs, so an off-site failure masks the state of the local snapshot | #93 |

The honest current position for the database: **local snapshots are reliable, off-site is
one copy and best-effort.** The Google OAuth app was published on 2026-09-04 and the
remote verified working, which closed #94 and ended the weekly token expiry. Levels 2 and
3 are unaffected by any of it. Active alerting (#89) was closed as not planned: it needs a
schedule to alarm against, and there isn't one.
