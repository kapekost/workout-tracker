# AGENTS.md — workout-tracker

Guidance for AI agents (and humans) working on this repo. Read this fully before
making changes or deploying. Keep the **Status** section current; move shipped
work to `docs/CHANGELOG.md`.

## What this is

A mobile-first gym tracker: logs sets/reps/weight, tracks progress, shows form
cues for a 4-day Upper/Lower split.

- **Backend**: Python FastAPI + SQLite. Serves the built frontend as static files
  and the JSON API from one process (`uvicorn main:app` on `:8000` inside the
  container).
- **Frontend**: React + Vite + Tailwind + Recharts. Built to static assets at
  image-build time and copied into the backend image (`/app/static`).
- **Packaging**: a single multi-stage Docker image. One container, nothing else.
- **Data**: SQLite file at `/app/data/workouts.db`, persisted via the `./data`
  volume. Never commit the DB; `data/` is gitignored.

## Where it runs

| Thing | Value |
|---|---|
| Dev repo (Mac) | `~/dev/workout-tracker` (Apple Silicon, `arm64`) |
| GitHub | `github.com/kapekost/workout-tracker` (private) |
| Pi host | `rpi-home` — `192.168.1.170`, user `kapekost`, SSH key `~/.ssh/id_raspi` |
| Pi model | **Raspberry Pi 3 B+** (`aarch64`, ~1 GB RAM, micro-USB power) — the RAM constraint drives everything below |
| Pi repo clone | `~/workout-tracker` (read-only deploy key `id_workout_tracker` for `git pull`) |
| App URL (LAN) | `http://192.168.1.170:8080` |
| App URL (gym) | `http://100.64.119.1:8080` — Pi's Tailscale IP (Tailscale runs in **host** network mode) |
| Co-tenants on Pi | `homeassistant` + `tailscale` containers. **Do not disrupt them.** |

## Hard rules — do not violate

1. **NEVER build the image on the Pi.** A 1 GB Pi cannot compile the Vite
   frontend without exhausting RAM and thrashing swap (load spiked to ~20 and
   starved Home Assistant). Builds happen **only** on the Mac.
2. **No registry.** Images move Mac → Pi directly over SSH (`docker save | ssh |
   docker load`). Docker Hub / GHCR are intentionally not used.
3. **`docker-compose.yml` has no `build:` key and uses `pull_policy: never`.**
   This guarantees a missing image errors out instead of silently triggering an
   on-device build or a registry pull. Keep it that way.
4. **Host port is `8080`** (`8080:8000`). Port 80 is avoided so it can't collide
   with anything alongside Home Assistant.
5. **Protect the co-tenants.** Anything that touches the Pi must leave
   `homeassistant` (must stay `healthy`) and `tailscale` running. Prefer
   targeted, non-`sudo` Docker commands over host-wide actions or reboots.
6. **Data lives in the `./data` volume.** Never bake it into the image; never
   commit it. Note: `data/` on the Pi is root-owned (the container runs as
   root) — host-side deletes inside it go through `docker exec <ct> rm …`.

## Runbook

### Build (Mac)
```bash
cd ~/dev/workout-tracker
docker buildx build --pull --platform linux/arm64 \
  --build-arg APP_COMMIT=$(git rev-parse --short HEAD) \
  -t kapekost/workout-tracker:latest --load .
```
(`--pull` refreshes the `python:3.11-slim` base so patched CVEs are picked up;
`APP_COMMIT` is the version stamp shown in the UI and `/api/health` — build
from a clean, committed tree so the stamp names what actually shipped.)

### Pre-deploy safety snapshot (any schema-changing deploy)
```bash
curl -s http://192.168.1.170:8080/api/export > pre-deploy-$(date +%F).json
```

### Transfer to the Pi (no registry)
```bash
docker save kapekost/workout-tracker:latest | gzip | \
  ssh kapekost@192.168.1.170 'gunzip | docker load'
```

### Run / update (Pi)
```bash
ssh kapekost@192.168.1.170
cd ~/workout-tracker
git pull            # only needed when docker-compose.yml changed
docker compose up -d   # uses the loaded image; never builds, never pulls
```

### Verify (every deploy)
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://192.168.1.170:8080/      # expect 200
curl -s http://192.168.1.170:8080/api/health
#   expect {"status":"ok", "version":"<the commit you just deployed>",
#           "last_backup_at":"<recent>", "last_backup_status":"ok"}
#   version != your HEAD short-SHA → the old image is still running.
#   "stale" = the ok-heartbeat is >26h old → the backup chain stopped running; investigate.
#   (warn-only on a fresh install where no backup has ever run: "none")
ssh kapekost@192.168.1.170 'docker compose -f ~/workout-tracker/docker-compose.yml ps; \
  docker ps --format "{{.Names}} {{.Status}}" | grep homeassistant'      # HA still healthy
```
The Home page footer shows the same `v <sha>` stamp — a phone-side check that
the PWA has picked up the new build. (Bundle-hash comparison against
`frontend/dist` still works as a secondary check.)

### Deploy off the home LAN (Raspberry Pi Connect — no SSH)
SSH (22) isn't reachable over Tailscale (the Pi is view-only on `:8080`), and
Raspberry Pi Connect is a **browser shell only** — no SSH/`scp`/pipe. So when
off-LAN, transfer the image as a **GitHub release asset** the Pi pulls over
HTTPS. The no-registry design is preserved: it's a file artifact, compose still
loads a local image (`pull_policy: never`). The built image is just compiled
public code on stock base images — no secrets/DB baked in — so a public asset
is safe.

On the Mac (build first, as above):
```bash
DATE=$(date +%Y%m%d); HEAD=$(git rev-parse --short HEAD)
docker save kapekost/workout-tracker:latest | gzip > /tmp/workout-tracker-$DATE.tar.gz
gh release create "deploy-$DATE" /tmp/workout-tracker-$DATE.tar.gz \
  -t "Deploy image $DATE ($HEAD)" -n "arm64 image, commit $HEAD"
gh release view "deploy-$DATE" --json assets -q '.assets[].url'   # asset URL
```
In the Pi's Connect browser shell (connect.raspberrypi.com → Pi → shell):
```bash
cd ~/workout-tracker && git pull && \
  curl -L <asset-url> | gunzip | docker load && docker compose up -d
docker image prune -f   # optional: drop the old image
```
Then run the same **Verify** block from anywhere on the tailnet.

### Backup — as built (nothing to install; re-setup notes below)

Nightly cron on the Pi host (`crontab -l`):
`30 3 * * * /bin/bash $HOME/workout-tracker/scripts/backup.sh >> $HOME/backup.log 2>&1`

`scripts/backup.sh` does: `VACUUM INTO` **inside the container** (the host
cron user can't read the container's root-owned WAL sidecars, and the image
has no sqlite3 CLI — it uses Python) → `docker cp` out to `~/backups/` (14-day
local retention) → `rclone copy` to `gdrive:workout-tracker-backups` (keep-all
by default; ~16 MB/yr — set `REMOTE_KEEP_DAYS` to prune) → heartbeat event to
the app (visible in `/api/health`). rclone is a **static binary at
`~/.local/bin/rclone`** (no sudo on the Pi), remote name `gdrive`.

Failure visibility: the in-app heartbeat can't fire if the container is down,
so **staleness is the real signal** — `/api/health` reports
`last_backup_status: "stale"` when the last ok is >26 h old. For active
alerting, set `HEARTBEAT_URL` (e.g. a free healthchecks.io ping) in the cron
line; the script pings it (or `…/fail`) independently of the app.

Re-setup on a fresh Pi (no sudo needed):
1. Download the arm64 rclone static binary to `~/.local/bin/rclone`, `chmod +x`.
2. `rclone config` → remote `gdrive` (Google Drive), authorize in a browser.
3. Test: `bash ~/workout-tracker/scripts/backup.sh` → file lands in Drive,
   `/api/health` shows a fresh `last_backup_at`.
4. `crontab -e` → add the cron line above.

### Restore

- **API restore (destructive):** `POST /api/import` with
  `{"mode":"replace","confirm":true,"envelope":<export-json>}`. Auto-snapshots
  the live DB to `data/pre-import-*.db` first (newest 3 kept), atomic, rolls
  back on error. Without `confirm:true` it's a no-op `400`.
- **File restore:** stop the container, drop a backup `.db` into
  `data/workouts.db`, restart.
- **From Drive:** `~/.local/bin/rclone copy gdrive:workout-tracker-backups/<file> ~/restore-drill/`
  then one of the above.
- **Last drill: 2026-07-09** — snapshot pulled from Drive, opened read-only in
  the container, `PRAGMA integrity_check` ok, row counts matched live. Re-drill
  after any schema change or ~quarterly.

### Typical change loop
Edit code on the Mac → commit & push → **Build** → **Transfer** → **Run/update** on
the Pi → **Verify**. The git push keeps source history; the image transfer is what
actually updates the running app. On-LAN use `save | ssh | load`; off-LAN use the
release-asset path above.

## Gotchas learned the hard way

- `sudo` over a non-interactive SSH session hangs waiting for a password. Avoid it;
  the `kapekost` user is in the `docker` group, so `docker ...` needs no `sudo`.
- The `tailscale` CLI is **not** on the Pi host — it's inside the `tailscale`
  container: `docker exec tailscale tailscale ip -4`.
- The running app footprint is tiny (~12 MiB RAM, <1% CPU). If the Pi is ever
  thrashing again, something is **building** — stop it; never build here.
- The Pi's weekly HA cron (`docker pull … && docker restart homeassistant`)
  **does not actually update HA** — `restart` keeps the old image. See the
  backlog before "fixing" anything HA-related; it's the user's call.
- `systemctl --user` on the Pi needs `XDG_RUNTIME_DIR=/run/user/$(id -u)` when
  invoked over SSH.

## Status

_Last updated: 2026-07-16 08:00 BST._

**Running now:** commit `e1366a9`, redeployed from scratch 2026-07-16 after
the Pi's SD-card death (2026-07-12) and rebuild (2026-07-14) wiped the prior
install — see [[project-raspberry-pi-rebuild]]. `~/workout-tracker` on the Pi
is a fresh `git clone` (no deploy key: the GitHub repo is currently **public**,
not private as previously noted here — confirm that's intentional). Verified:
`/api/health` `version` = `e1366a9`, root 200, HA still healthy. DB is a fresh
schema + seeded exercise catalog only — no workout history survived the
SD-card death (no backup existed yet at that point either).

**Backup cron is NOT set up on the rebuilt Pi** — `~/.local/bin/rclone` and
its `gdrive` remote are gone along with everything else non-HA. `/api/health`
correctly shows `last_backup_status: "none"`. Follow "Re-setup on a fresh Pi"
above (rclone binary + `rclone config` OAuth, needs an interactive browser)
before trusting this install with real data long-term.

**Previously running:** commit `3420458` (responsive-sweep wave — plan Part B
at full matrix, 13 catalog items fixed), deployed and verified 2026-07-10
~10:45 BST. Tests 42 backend + 62 frontend. Catalog:
`docs/superpowers/audits/2026-06-30-responsive-catalog.md`. Shipped history:
`docs/CHANGELOG.md`.

**2026-07-10 morning incident (~09:33–10:30 BST):** HA entered a clean-exit
crash loop (RestartCount 7→18, exit 0, no error lines, no OOM), pegging the
box (load 7.7) so hard that SSH banner exchange and app TCP responses timed
out while ICMP stayed fine. Recovery: `docker stop homeassistant` + `sync`,
power-cycle at the socket, deploy done in the idle window, HA started after.
**PSU is confirmed bad:** seconds after the fresh boot, with HA still
stopped, `vcgencmd get_throttled` read `0x50005` — under-voltage *currently
active*, not just the sticky since-boot bits. Swap the PSU (see Blocked on
user) before trusting this box with anything else.

**HA still looping post-reboot** (as of 11:05 BST): after `docker start`,
RestartCount hit 9 within ~25 min, health stuck at `starting`, `:8123`
refuses. The power-cycle did not fix it — consistent with the PSU being the
root cause (HA boot is the heaviest load and likely triggers the dips). To
park it until the new PSU: `docker stop homeassistant` (its
`unless-stopped` policy keeps it parked across reboots); `docker start
homeassistant` after the swap. The gym-tracker app rides through the churn
but health responses slow to ~9 s at load peaks.

**Dated action items**
- **Before ~2026-Q4 — rclone client_id** (user + agent): rclone's shared Google
  client_id is retired during 2026; nightly backups then start failing (they'll
  show as `stale`/`failed` in `/api/health`). User creates a personal OAuth
  client_id (https://rclone.org/drive/#making-your-own-client-id — needs their
  Google login, ~10 min), then on the Pi: `rclone config update gdrive
  client_id <id> client_secret <secret>` → `rclone config reconnect gdrive:` →
  one manual `backup.sh` run to verify.
- ~~2026-07-10, after 03:30 — first real cron run~~ **verified in full
  2026-07-10 09:30 BST**: `/api/health` `last_backup_at 02:30:29Z` (= 03:30
  BST) `ok`; `~/backup.log` exists; `workout-20260710-033001.db` present
  locally and on Drive (3 snapshots total). The log carries rclone's NOTICE
  that the shared client_id retires during 2026 — the Q4 item above is live.
  (SSH note: use plain `ssh kapekost@192.168.1.170` — `BatchMode=yes` blocks
  the keychain from supplying the key passphrase and fails with
  publickey-denied.)
- **Whenever physically at the Pi** (needs interactive sudo): `sudo apt update
  && sudo apt full-upgrade` (lists were 16 days stale), install
  `unattended-upgrades` (security pocket), and check `vcgencmd get_throttled`
  after swapping the PSU (under-voltage events recur — see backlog).

**Blocked on user**
- **HTTPS domain** (`https://rpi-homeassistant.tailce23b4.ts.net` via Tailscale
  Serve): blocked on one click — Tailscale admin → DNS → MagicDNS → "Enable
  HTTPS". Then: `docker exec tailscale tailscale serve --bg 8080`.
- **PSU replacement**: Pi 3 B+ reports recurring under-voltage (`0x50000`,
  reappeared within 3 h of a reboot); an unexplained reboot on 2026-07-09
  looks like a brown-out. Any quality 5.1 V / 2.5 A micro-USB supply fixes it
  (official Raspberry Pi universal PSU, ~€10-15).
- **Home Assistant image**: HA runs a months-old image because weekly
  `pull && restart` never recreates the container; the current `:stable` sits
  unused (3.4 GB). Fix is `docker rm` + re-`run`/compose with the same args —
  co-tenant, so the user should schedule it.

## Backlog

- Idle rest-timer hint ("Log a set to start rest timer") if discoverability
  matters — the one surviving deferred UI item; the 2026-06-30 responsive
  sweep (Part B) itself shipped 2026-07-10 at full scope.
- Scripted one-command deploy (build + transfer + restart) on the Mac.
- Pin the image to a version tag instead of `:latest` for rollbacks (off-LAN
  release assets already give dated artifacts; on-LAN `:latest` does not).
- `tailscale up --ssh` (run while physically on the Pi): would let the simpler
  `save|ssh|load` deploy work from anywhere, replacing the release-asset
  workaround (which works but is manual).
- Optional: `HEARTBEAT_URL` (healthchecks.io) in the backup cron for active
  failure alerts; `~/backup.log` rotation eventually.
