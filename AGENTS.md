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
- **Frontend**: React + Vite + Recharts, styled via `frontend/src/lib/theme.js`
  tokens and hand-written CSS (Tailwind removed 2026-08-25). Built to static assets at
  image-build time and copied into the backend image (`/app/static`).
- **Packaging**: a single multi-stage Docker image. One container, nothing else.
- **Data**: SQLite file at `/app/data/workouts.db`, persisted via the `./data`
  volume. Never commit the DB; `data/` is gitignored.

## Where it runs

| Thing | Value |
|---|---|
| Dev repo (Mac) | `~/dev/workout-tracker` (Apple Silicon, `arm64`) |
| GitHub | `github.com/kapekost/workout-tracker` (public — no secrets ever committed, confirmed 2026-07-16; deploy key below is legacy) |
| Pi host | `rpi-home` — `192.168.1.170`, user `kapekost`, SSH key `~/.ssh/id_raspi` |
| Pi model | **Raspberry Pi 3 B+** (`aarch64`, ~1 GB RAM, micro-USB power) — the RAM constraint drives everything below |
| Pi repo clone | `~/workout-tracker` (plain anonymous HTTPS clone — repo is public, no deploy key needed for `git pull`) |
| App URL (LAN) | `http://192.168.1.170:8080` |
| App URL (gym) | `http://100.65.191.3:8080` — Pi's Tailscale IP (Tailscale runs in **host** network mode). **This IP drifts** — it changed at least once already (rebuild-era `100.64.119.1` → current `100.65.191.3`, caught 2026-07-18 after it silently broke gym access). Verify with `docker exec tailscale tailscale ip -4` on the Pi before trusting this value; the durable fix is the blocked HTTPS/MagicDNS domain below. |
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

## Local development (Mac)

**None of these tools are on `PATH` in a non-interactive shell.** Every one of them cost
a rediscovery cycle; the literal paths are below so the next session doesn't repeat it.

| Tool | Where it actually is |
|---|---|
| `node` / `npm` | `~/.nvm/versions/node/v22.14.0/bin` — nvm never loads in a non-login shell. Prefix: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:$PATH"` |
| `docker` | `/usr/local/bin/docker` → Docker.app. The **daemon is often not running**; `open -a Docker` and wait ~30 s for `docker version` to report a server. |
| Python | **Use Homebrew `python@3.14`.** System `/usr/bin/python3` is 3.9.6 and *cannot* install this repo's pins — `fastapi==0.138.1` has no 3.9 wheel, and the failure ("No matching distribution found") does not mention the Python version. |

```bash
# Frontend
export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:$PATH"
cd frontend && npm install && npm test          # vitest, ~2 s
npm run dev                                     # Vite dev server, proxies /api

# Backend
cd backend
/opt/homebrew/opt/python@3.14/bin/python3.14 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m pytest -q                   # ~1 s
.venv/bin/python -m uvicorn main:app --reload   # DATABASE_URL defaults to /app/data — override locally
```

Both `.venv/` and `node_modules/` are gitignored, so each git worktree needs its own —
they are not shared with the main checkout.

## Runbook

### Build (Mac)
```bash
cd ~/dev/workout-tracker
git pull --ff-only          # ⚠ see below — the stamp lies if you skip this
docker buildx build --pull --platform linux/arm64 \
  --build-arg APP_COMMIT=$(git rev-parse --short HEAD) \
  -t kapekost/workout-tracker:latest --load .
```

> **⚠ Build only from a current, clean tree.** `APP_COMMIT` is whatever `HEAD` happens to
> be, so a stale or dirty checkout produces an image stamped with a commit that does not
> describe its contents — and the Verify step below will happily pass, because it only
> checks that `/api/health` matches the SHA you *built*, not that the SHA is the one you
> meant. Since agent worktrees live under `.claude/worktrees/`, it is easy for `main` to
> sit several commits behind the branch you actually want. Building from a worktree is
> fine — just confirm `git rev-parse --short HEAD` is the commit you intend first.

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

**A deploy is invisible to an installed PWA until it re-checks.** The service
worker precaches the app shell, and a PWA resumed from the background never does
a fresh navigation — so the browser's own update check doesn't fire and the old
build keeps rendering even though the Pi is serving the new one. Confirm with the
`v <sha>` footer stamp on Home: if it disagrees with `/api/health`, the phone is
on a cached bundle, not a failed deploy. Force-quitting and reopening the app
fixes it. Since `b14c845` the app also checks on its own whenever it becomes
visible (and every 30 min), gated to skip while a workout is open so the
auto-reload can't discard typed-but-unlogged sets.

- `sudo` over a non-interactive SSH session hangs waiting for a password. Avoid it;
  the `kapekost` user is in the `docker` group, so `docker ...` needs no `sudo`.
- The `tailscale` CLI is **not** on the Pi host — it's inside the `tailscale`
  container: `docker exec tailscale tailscale ip -4`.
- The running app footprint is tiny (~12 MiB RAM, <1% CPU). If the Pi is ever
  thrashing again, something is **building** — stop it; never build here.
- **Correction 2026-08-09:** the "Pi's weekly HA cron" referenced below used to
  exist but is gone as of this date — checked `crontab -l`, `/etc/cron.d/`,
  `/etc/cron.weekly/`, and `systemctl list-timers`, none of it is there anymore.
  HA + Tailscale image updates are now handled by Watchtower (re-enabled
  2026-08-09 on the `nickfedor/watchtower` fork, see
  `~/dev/claude/home-assistant/install/docker-compose.yml`) — nightly at 04:00,
  proper pull+recreate (not the old broken pull-then-restart pattern below).
  workout-tracker itself is intentionally NOT covered (no registry, Mac-built
  images only) — its update path stays the manual Build→Transfer→Run loop above.
- (Historical, kept for context) the old weekly HA cron
  (`docker pull … && docker restart homeassistant`) **did not actually update
  HA** — `restart` keeps the old image; `docker compose up -d` (or Watchtower)
  is required to actually swap it. If you ever see this pattern reintroduced
  anywhere, it's the same bug.
- `systemctl --user` on the Pi needs `XDG_RUNTIME_DIR=/run/user/$(id -u)` when
  invoked over SSH.

## Design docs & research

Durable reference material. Specs and plans live in `docs/superpowers/`; shipped
history is in `docs/CHANGELOG.md`.

- **[`docs/superpowers/research/2026-08-16-recovery-science.md`](docs/superpowers/research/2026-08-16-recovery-science.md)**
  — evidence review on strength-training recovery, from primary sources (16 citations:
  Phillips 1997, Damas 2015/2016, Dourado 2023, Carmona 2018, Pelland 2025, ACSM 2026,
  Ogasawara, ISSN 2017). **Read this before touching anything that estimates recovery,
  readiness, volume landmarks, or training frequency.** Its §7 "Limitations" list is
  binding on what the app may claim to the user. Key conclusions:
  - Recovery time tracks **movement pattern, not muscle size** (Dourado 2023: knee
    extension 24 h vs leg press 48 h, same muscle, same subjects).
  - Count **indirect sets as 0.5** — best predicts adaptation (Pelland 2025).
  - We have **none** of the inputs commercial recovery scores use (HRV, RHR, sleep,
    skin temp), and between-subject variance is huge (Carmona 2018: 21% vs 52% MVC
    loss on one protocol). Never show a recovery **percentage**; never say "readiness".
  - No "losing gains" warnings before ~3 weeks off (Ogasawara: no significant loss at 3 wk).
- **[`docs/superpowers/specs/2026-08-16-muscle-group-recovery-design.md`](docs/superpowers/specs/2026-08-16-muscle-group-recovery-design.md)**
  — muscle-group picker + per-muscle freshness estimate. Why the feature is
  shaped this way; the shipped code is authoritative for what it does. Shipped
  2026-08-16. Execution record (what landed, and two plan errors not to
  re-introduce): [`docs/superpowers/plans/2026-08-16-muscle-group-recovery.md`](docs/superpowers/plans/2026-08-16-muscle-group-recovery.md).

## Status

_Last updated: 2026-08-25 (UI/UX initiative status)._

**Running now:** commit `adbf3f5`, deployed 2026-08-17 08:37 BST. Hardens
`/api/import` (the disaster-recovery restore path) before any schema work
touches it: restore counts now come from the DB post-commit instead of the
uploaded envelope, the envelope gate only requires tables that existed at
the envelope's own `schema_version` (so older backups stay importable as
new tables are added), and `PRAGMA user_version` no longer rolls backward on
an older restore. TDD, see `docs/CHANGELOG.md` for the full writeup. Verified:
root 200, `/api/health` `version` = `adbf3f5`, `homeassistant` still
`healthy`, `tailscale` up, live data intact (1 session / 17 sets / 297
events). No schema change, so no migration and no restore drill required —
a pre-deploy `/api/export` snapshot was still taken since the restore path
itself was what changed.

**Nothing is unreleased.** `main` == `origin/main` == the deployed commit.
Tests 53 backend + 142 frontend, both green.

**Rollback:** the previous image (`9f3f237`) is still on the Pi, untagged, as
`8035631eefb5` — `docker tag 8035631eefb5 kapekost/workout-tracker:latest &&
docker compose up -d` reverts. No schema change was involved, so no data
migration is entangled with it.

**UI/UX design-system initiative — all 5 upgrades complete 2026-08-25, not
yet merged/deployed.** Full writeup, upgrade-by-upgrade: `docs/CHANGELOG.md`.
Built on one feature branch (`claude/ui-ux-upgrades-agents-x99pq8`): design
tokens + migration (`theme.js`, 14 files migrated), Tailwind's removal
(`.page-shell` + a hand-written reset replace the utility layer and
preflight), 6 shared components swept onto every call site
(`Eyebrow`/`Toast`+`useToast`/`Chip`/`EmptyState`/`DayAccent`/`DisclosureRow`),
a Playwright + GitHub Actions regression guard for the 2026-06-30 responsive
audit's ≥44px/320px floor, and the gym-workflow UX pass (idle rest-timer
hint, the 5 dimensional bugs — I13-I17 — the tokens spec found and deferred,
a `dataviz`-skill pass on `Progress.jsx`'s chart). Every commit across all
five left the suite green; currently 32 frontend test files / 210 tests +
a 12-test Playwright suite, all green, plus 69 backend tests unchanged from
`main` (backend has zero diff against `main` — none of the five needed a
backend change). `MuscleGroupPicker`'s `RecoveryRing` color-ramp
re-verified visually unaffected in a running browser after every upgrade
that touched a neighboring file. **This branch lands on `main` only once
the whole initiative is reviewed and merged — that review/merge decision
has not been made yet.**

**D (the design-system decision) is not fully closed** even with all five
upgrades landed: the number-input double-styling conflict
(`PersonalBests.jsx`'s three number fields vs. the global
`input[type="number"]` CSS rule, inventory §3.2a — deleting the rule as
originally planned would have visibly regressed that page once checked) and
the stat-pair pattern (inventory §3.2, lowest duplication count) both
remain deliberately deferred, per the component-extraction spec's own
scope. Whichever is picked up next should land **before** profiles (B)
starts this project's first schema migration, which makes a pre-deploy
export snapshot and a restore drill mandatory.

The backlog is open — see
[`docs/superpowers/backlog/2026-08-16-next-workstreams.md`](docs/superpowers/backlog/2026-08-16-next-workstreams.md)
for the three candidate workstreams (profiles, import, UI/UX rethink) and
nutrition in the Backlog section below, plus a newly-captured fourth:
[adaptive coaching / AI-in-the-loop programming](docs/superpowers/backlog/2026-08-23-adaptive-coaching.md),
not yet sequenced. Sequencing item 1 (muscle-group
picker) and the `/api/import` hardening that the profiles research surfaced
are both done; the design-system decision (D) is above.

**Previously (2026-07-16 → 2026-08-16):** commit `e1366a9`, redeployed from
scratch 2026-07-16 after
the Pi's SD-card death (2026-07-12) and rebuild (2026-07-14) wiped the prior
install. `~/workout-tracker` on the Pi is a fresh anonymous `git clone` over
HTTPS — confirmed 2026-07-16 the GitHub repo is genuinely public (not private
as this doc used to claim) and that nothing sensitive has ever been committed
(full history swept: no `.env`/`.db` files, no API keys, only doc
placeholders). Staying public is intentional; the old "deploy key" references
above are legacy from when the repo was believed private. Verified:
`/api/health` `version` = `e1366a9`, root 200, HA still healthy.

**Real workout data restored 2026-07-16.** The SD-card death did not lose
data after all: nightly Drive backups predate the crash and survived it
independently of the Pi's SD card. Pulled `workout-20260712-033001.db`
(the last pre-crash snapshot) from `gdrive:workout-tracker-backups/`,
verified `PRAGMA integrity_check` = ok and real rows (1 completed session,
17 sets, 56 events) before restoring via the **file restore** path (stop
container → `docker cp` into `/app/data/workouts.db` → start). Live
`/api/export` now correctly serves the 2026-07-08 Upper A session. The
fresh-install empty DB that briefly ran is saved at
`~/restore-drill/pre-restore-empty-*.db` on the Pi should it ever matter
(it shouldn't — it had zero real data).

**Backup cron re-established 2026-07-16.** `~/.local/bin/rclone` reinstalled
(arm64 static binary), `gdrive` remote reauthorized via a fresh OAuth token
(shared client_id — still works today, but see the Q4 rclone client_id
item below, now more urgent since this is a second cold-start), crontab
entry restored (`30 3 * * * bash ~/workout-tracker/scripts/backup.sh`).
`backup.sh` run manually and confirmed landing in Drive;
`/api/health.last_backup_status` = `ok`.

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
- **⚠ Raised priority 2026-07-16 — rclone client_id** (user + agent): rclone's
  shared Google client_id is retired during 2026; nightly backups then start
  failing (they'll show as `stale`/`failed` in `/api/health`). Originally a
  "before Q4" item; escalating it because the `gdrive` remote has now had to
  be **re-authorized from scratch twice** (2026-07-10 first cron run, and
  again 2026-07-16 after the SD-card rebuild wiped `~/.local/bin/rclone` and
  its config). A personal client_id survives a Pi wipe the same way a shared
  one doesn't — it's stored the same place either way, but doing this now
  removes one recurring manual step from every future disaster recovery.
  User creates a personal OAuth client_id
  (https://rclone.org/drive/#making-your-own-client-id — needs their Google
  login, ~10 min), then on the Pi: `rclone config update gdrive
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

- **Nutrition guidance** (deferred from the 2026-08-16 muscle-group/recovery design):
  pre/post-workout food suggestions and protein timing. Scope it to general, sourced
  guidance (ISSN position stands) with a "not medical advice" line — not personalised
  vitamin/supplement dosing. Needs its own spec. The one datum it requires that the app
  deliberately does **not** collect today is bodyweight (ISSN protein guidance is g/kg,
  1.4–2.0); the recovery work needs no biometrics at all.
- Scripted one-command deploy (build + transfer + restart) on the Mac.
- Pin the image to a version tag instead of `:latest` for rollbacks (off-LAN
  release assets already give dated artifacts; on-LAN `:latest` does not).
- `tailscale up --ssh` (run while physically on the Pi): would let the simpler
  `save|ssh|load` deploy work from anywhere, replacing the release-asset
  workaround (which works but is manual).
- Optional: `HEARTBEAT_URL` (healthchecks.io) in the backup cron for active
  failure alerts; `~/backup.log` rotation eventually.
