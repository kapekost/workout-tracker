# AGENTS.md — workout-tracker

Guidance for AI agents (and humans) working on this repo. Read this fully before
making changes or deploying. Keep the **Status** section current; move shipped
work to `docs/CHANGELOG.md`.

## Orchestration

Task planning lives in `docs/orchestration/`:
- `STATE.md` — current cursor, what to do next.
- `PLAYBOOK.md` — how `/orchestrate` runs.
- `GUARDRAILS.md` — hard rules for the orchestrator (merge/branch discipline,
  destructive-op approval, task-sizing); wins on conflict with `PLAYBOOK.md`/`STATE.md`.
- `DECISIONS.md` — owner decisions already made; don't relitigate.
- `IMPROVEMENTS.md` — friction log, reviewed automatically per tick.

Tasks live as GitHub Issues (`type`/`priority`/`effort` labels), ranked in the
repo's Project board. `/orchestrate` reads and writes them via `gh`.

MCP servers: copy `.mcp.json.example` to `.mcp.json` and fill in what this repo
actually needs. Start new servers at local scope, promote to project scope only
once reviewed — never commit a real credential; reference an env var instead.

### Deployment knowledge stays local

This repo deploys to one specific machine (see "Where it runs" below), which
means it's tempting for this file to accumulate that machine's real host, IP,
SSH key, and co-located services. Don't — that's `AGENTS.local.md` territory
(gitignored; copy `AGENTS.local.md.example` to start one). `AGENTS.md` stays
generic and portable: what this project is, how to build/test/deploy it in
the abstract, so someone forking this onto their own infrastructure still
finds it useful. `AGENTS.local.md` is where the literal, copy-pasteable
specifics for *this* deployment actually live — read it before deploying,
and keep it current the same way `STATE.md` gets kept current.

Everything below this section is product/deployment knowledge — the runbook,
hard rules, and status log — independent of orchestration and unaffected by it.

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
  volume. Never commit the DB; `data/` is gitignored. Schema v4 (#66,
  2026-08-31): added a `profiles` table + `profile_id` on every other table,
  backfilled to a seeded `kapekost`/admin profile (`password_hash` left
  `NULL` — no login yet, see #67).

## Where it runs

Single Docker image, deployed over SSH to a remote host (no registry —
`docker save | ssh | docker load`, `pull_policy: never`). GitHub is public
(`github.com/kapekost/workout-tracker` — confirmed no secrets ever
committed). **The real deploy target (host, IP, SSH key, hardware
constraints, anything it runs alongside) lives in `AGENTS.local.md`**
(gitignored) — read that before deploying anywhere. Copy
`AGENTS.local.md.example` to start one if it's missing.

## Hard rules — do not violate

1. **Never build the image on the deploy target.** If it's resource-
   constrained, build elsewhere and transfer the finished image.
2. **No registry.** Images move from the build machine to the deploy
   target directly (`docker save | ssh | docker load`, or an equivalent
   file transfer). Docker Hub / GHCR are intentionally not used.
3. **`docker-compose.yml` has no `build:` key and uses `pull_policy:
   never`.** This guarantees a missing image errors out instead of
   silently triggering an on-device build or a registry pull. Keep it
   that way.
4. **Data lives in the `./data` volume.** Never bake it into the image;
   never commit it.

Any host-specific version of these rules (exact port choices, co-located
services that must not be disrupted, hardware RAM limits) belongs in
`AGENTS.local.md`, not here — see that file for what actually applies to
the current deployment.

## Local development

Frontend needs Node; backend needs Python 3.11+ and pip. If this machine's
shell doesn't have them on `PATH`, check `AGENTS.local.md` for known-good
paths before re-discovering them.

```bash
# Frontend
cd frontend && npm install && npm test          # vitest, ~2 s
npm run dev                                     # Vite dev server, proxies /api

# Backend
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m pytest -q                   # ~1 s
.venv/bin/python -m uvicorn main:app --reload   # DATABASE_URL defaults to /app/data — override locally
```

Both `.venv/` and `node_modules/` are gitignored, so each git worktree needs its own —
they are not shared with the main checkout.

## Runbook

The deploy shape is: **build** the image on a capable machine → **transfer**
it to the deploy target (no registry) → **run/update** there → **verify**.
The literal, copy-pasteable commands — real host, real paths, backup/restore
setup, off-LAN transfer — live in `AGENTS.local.md`, since they're specific
to one deployment. What's true for any deployment of this project:

- Build with `--build-arg APP_COMMIT=$(git rev-parse --short HEAD)` — this
  becomes the version stamp shown in the UI footer and `/api/health`, and
  the thing Verify checks against. Build from a clean, committed tree so
  the stamp names what actually shipped.
- The image is tagged with that same commit SHA, not `:latest` — `docker-compose.yml`
  reads the tag to run from `$APP_COMMIT`. Set it (`APP_COMMIT=$(git rev-parse --short
  HEAD)`) before every `docker compose up -d`, on both the build and run steps — a
  rollback is just re-running with an older `APP_COMMIT` whose image is still loaded
  locally, no re-tagging trick needed.
- Before any schema-changing deploy, snapshot via `GET /api/export`.
- After every deploy, verify `/api/health` reports the commit you just
  built. `last_backup_status` is informational: backups are manual, so
  `stale` only means the last one is over a week old, and `scripts/deploy.sh`
  warns rather than failing on it. `failed` is the one to chase — it means
  the chain ran and broke.
- Re-drill a restore after any schema change.

**How the whole backup and recovery story fits together — every level, what
each protects against, and the current known gaps — is `docs/BACKUPS.md`.**
Read that rather than reassembling it from the notes scattered below; the
copy-pasteable commands for this specific deployment are in
`AGENTS.local.md`.

### Typical change loop
Edit code → commit & push → **Build** → **Transfer** → **Run/update** →
**Verify**. The git push keeps source history; the image transfer is what
actually updates the running app.

**Scripted:** `scripts/deploy.sh` wraps Build/Transfer/Run/Verify into one
command, reading the real host/path from `AGENTS.local.md` (see
`AGENTS.local.md.example`'s "Scripted deploy configuration" section) rather
than hardcoding them. Refuses to run against a dirty working tree, and
verifies `/api/health`'s `version` matches what it just built plus that
`last_backup_status` isn't `stale`. Snapshot via `GET /api/export` first if
the deploy includes a schema change — the script doesn't do that step for
you.

## Gotchas learned the hard way

**A deploy is invisible to an installed PWA until it re-checks.** The service
worker precaches the app shell, and a PWA resumed from the background never does
a fresh navigation — so the browser's own update check doesn't fire and the old
build keeps rendering even though the deploy target is serving the new one.
Confirm with the `v <sha>` footer stamp on Home: if it disagrees with
`/api/health`, the phone is on a cached bundle, not a failed deploy.
Force-quitting and reopening the app fixes it. Since `b14c845` the app also
checks on its own whenever it becomes visible (and every 30 min), gated to
skip while a workout is open so the auto-reload can't discard
typed-but-unlogged sets.

**Vite 8 adds a second family of optional-binary risk on Alpine/arm64.**
Vite 8 (landed via #22/#59, 2026-08-30) defaults to the Rolldown bundler
instead of Rollup, which pulls in per-platform optional native bindings
(e.g. `@rolldown/binding-linux-arm64-musl`) alongside Rollup's — the same
*class* of bug as the npm/cli#4828 issue this repo already hit and fixed
once (`efd88ca`: `npm ci` reports success but silently skips installing
the platform binary on the Alpine builder stage). Not yet confirmed to
actually occur — #22/#59 could not run a literal `docker buildx build` to
check (this session's sandbox blocks the Docker Hub CDN by org policy) —
but watch for it specifically on the next real build, and apply the same
fix pattern (explicit post-`npm ci` install of the missing platform
binary, version-matched to the lockfile) if it does.

**The node:20→26-alpine bump (#23) needed no lockfile change — the original
failure didn't reproduce outside real Alpine.** Dependabot PR #7 (the same
bump) passed CI but failed an actual `docker buildx build` with `npm error
Missing: @esbuild/aix-ppc64@0.21.5 from lock file`, attributed to npm
11.19.0 (bundled with `node:26-alpine`) resolving the lockfile differently
than npm 10.x. Investigated for real rather than rubber-stamped: downloaded
the genuine node v26.8.1 linux-x64 binary (confirmed npm 11.19.0, matching
what `node:26-alpine` bundles) and ran real `npm ci` against (a) the current
lockfile and (b) the exact pre-#59 lockfile that still pinned esbuild 0.21.5
and contains the literal `@esbuild/aix-ppc64@0.21.5` entry PR #7's error
named — both installed cleanly, no sync error, even forcing
`--os=linux --cpu=x64 --libc=musl`. `npm install --package-lock-only` under
node 26 against the current `package.json` also reproduced the committed
lockfile byte-for-byte. Two things likely explain the gap: esbuild is no
longer even a resolved dependency post-vite-8 (#59 regenerated the lockfile
fresh for unrelated reasons, which happened to carry this along), and the
original failure may simply be specific to the real Alpine/musl buildx
environment (this sandbox has no Docker daemon — same constraint #21/#22
hit) rather than a host-independent npm 10→11 incompatibility. Given the
clean, repeated, real reproduction attempts above, no lockfile regeneration
shipped with the bump. The Rolldown/arm64-musl risk in the entry above this
one is a separate, still-open question — this investigation was on x64/glibc,
not arm64/musl, so it neither confirms nor rules that one out. Watch the next
real `docker buildx build` for both.

Deploy-target-specific gotchas (SSH quirks, hardware limits, host
maintenance history) live in `AGENTS.local.md`.

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
- **[`docs/superpowers/specs/2026-08-17-personal-bests-design.md`](docs/superpowers/specs/2026-08-17-personal-bests-design.md)**
  — manual entry of a personal best held from before the app existed (no
  AI/notes parsing). Shipped 2026-08-17; documented retroactively 2026-08-30
  (#38) after the 2026-08-26 Issues migration caught the gap. Full writeup:
  `docs/CHANGELOG.md`.

## Status

_Last updated: 2026-09-04 (deployed `17bd4fc`; `main` is ahead — see below)._

**Running now:** commit `17bd4fc`, deployed 2026-08-31. Container healthy,
`/api/health` `status: ok`. Schema v5 (profiles + TopBar profile display,
#66/#76 and #69/#77). Verified live 2026-09-03.

**Unreleased — `main` is 4 commits ahead of the deployed image.** One of
them changes the runtime, so the next deploy is not a no-op:

- `0d8576b` — base image `python:3.11-slim` → `3.14-slim` (#81)
- `65a1804` — pydantic 2.13.4 → 2.13.5 (#80)
- `4cb2a08` — CI now tests on py3.14 to match the base image (#82)
- `79cc6c8` — docs only (#79)

Both dependency bumps were hand-verified before merge rather than trusted
on green checks, because **CI never builds this Dockerfile** — it runs
tests bare-metal on the runner, so a base image whose deps lack aarch64
wheels would fail the real build while CI stays green (the trap that kept
#7/#23 open for weeks). Verified: full `docker buildx build
--platform linux/arm64` clean with deps installing in 5.2s and no
compilation, 88 backend tests green on py3.14 + pydantic 2.13.5, container
smoke test (`/api/health` ok, `/` 200, `/api/sessions` 200), fresh DB
migrating to `user_version = 5`, image 287 MB vs 283 MB (+4 MB, immaterial
on the 1 GB box).

**Off-site backups: working, but best-effort by decision (2026-09-04).**
The 2026-09-01..04 outage (`invalid_grant`, four failed nights, last good
Drive copy 2026-08-31) is resolved — re-authorized 2026-09-04, verified
with a real snapshot landing in Drive and `/api/health` reading `ok`.

Two things changed while fixing it. The rclone scope was narrowed from
`drive` (**restricted**) to `drive.file` (**non-sensitive**), which Google
explicitly recommends — a backup only touches files it created, so full
Drive access was never warranted. Side effect: the old
`workout-tracker-backups` folder was created by rclone's former shared
client, so `drive.file` cannot see it and a fresh folder was created. Those
older snapshots remain safe in Drive and downloadable from the web UI,
simply outside rclone's view.

**The app is still in `Testing` publishing status, where Google expires
refresh tokens after 7 days — and the cron is weekly.** So most weekly
off-site copies are expected to fail until the app is published. Publishing
was deliberately deferred by the owner (#94) rather than pursued, because
the consent screen still carries three restricted scopes from the old
configuration and is shared project-wide with the Home Assistant / CCR
Agent clients; clearing them is likely safe but was not verified.

**Current honest position: local snapshots are reliable, off-site is
best-effort.** Local retention is 90 days on the Pi and unaffected by any
of this. See `docs/BACKUPS.md` for the full picture and #93/#94/#89 for the
tracked gaps.

**Previously running:** commit `5247896`, deployed 2026-08-25 — the UI/UX
design-system initiative merged to `main` (5 upgrades: design tokens +
migration, Tailwind's removal, 6 shared components swept onto every call
site, a Playwright + GitHub Actions responsive-regression guard, and the
gym-workflow UX pass). Full upgrade-by-upgrade writeup: `docs/CHANGELOG.md`.
Built on the Mac for `linux/arm64`; hit a new build failure first time
through — `npm ci` reports success but silently skips installing
`@rollup/rollup-linux-arm64-musl` on this Alpine builder stage
(npm/cli#4828), surfaced now because this PR's Tailwind removal
regenerated `package-lock.json`. Fixed in `efd88ca`: explicitly install
that one binary after `npm ci`, version-matched to whatever the lockfile
already pins for `rollup`, without touching the lockfile itself. Deployed
and verified (see `AGENTS.local.md` for the actual verify output). No
schema change, so no export snapshot or restore drill required.

Tests, per that merge (not re-run then): 69 backend + 210 frontend + a
12-test Playwright suite, all green. (Backend is now 88 — #24's real
backend CI landed since.)

**Rollback:** the previous image is still on the deploy target, untagged —
see `AGENTS.local.md` for the exact tag/hash and revert command. No schema
change was involved, so no data migration is entangled with it.

**Correction 2026-08-25 — an unmerged branch was very likely live in
production before this deploy.** While transferring this deploy, found
dangling images already on the Pi stamped `APP_COMMIT=1cbdfad` (built
2026-08-23 22:31 BST) and `APP_COMMIT=2b04e1a` (built 2026-08-24 19:29
BST) — the tip of a local-only `design-tokens` branch that was never
pushed to `origin`, superseded by an independent reimplementation of the
same migration inside the 5-upgrade initiative above. Untracked
`pre-deploy-2026-08-23.json` / `-2026-08-24.json` export snapshots on the
Mac, each timestamped about a minute after the matching image's build,
line up with the runbook's own pre-deploy-snapshot step — consistent
with both having gone all the way through **Run**, not just
Build/Transfer. So the "`main` == deployed commit" claim above was
already false for some window before today. No data risk either way —
same no-schema-change styling refactor now live — but the local commits
are archived, unpushed, on branch `design-tokens-wip-2026-08-24` in case
anything in that independent implementation is worth diffing against
what actually shipped.

**Previously running:** commit `adbf3f5`, deployed 2026-08-17 08:37 BST.
Hardened `/api/import` (the disaster-recovery restore path) before any
schema work touches it: restore counts now come from the DB post-commit
instead of the uploaded envelope, the envelope gate only requires tables
that existed at the envelope's own `schema_version` (so older backups
stay importable as new tables are added), and `PRAGMA user_version` no
longer rolls backward on an older restore. TDD, see `docs/CHANGELOG.md`
for the full writeup. Verified at the time: root 200, `/api/health`
`version` = `adbf3f5`, live data intact (1 session / 17 sets / 297
events).

**D (the design-system decision) is not fully closed** even with all five
upgrades landed and deployed: the number-input double-styling conflict
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
`/api/health` `version` = `e1366a9`, root 200.

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

**Backup cron re-established 2026-07-16** after the SD-card rebuild above.
Confirmed working: `backup.sh` run manually, landed in Drive,
`/api/health.last_backup_status` = `ok`.

**Previously running:** commit `3420458` (responsive-sweep wave — plan Part B
at full matrix, 13 catalog items fixed), deployed and verified 2026-07-10.
Tests 42 backend + 62 frontend. Catalog:
`docs/superpowers/audits/2026-06-30-responsive-catalog.md`. Shipped history:
`docs/CHANGELOG.md`.

Deploy-target incident history (outages, hardware issues, credential
rotations, dated action items) lives in `AGENTS.local.md`, not here — it's
specific to one deployment, not to the project.

## Backlog

**Migrated to the GitHub Issues board 2026-08-26** — see the Project board or
these Issues directly rather than treating this section as the source of truth:

- **Nutrition guidance** → [#33](https://github.com/kapekost/workout-tracker/issues/33) (`intake`, needs its own spec).
- **Pin image to a version tag instead of `:latest`** → [#35](https://github.com/kapekost/workout-tracker/issues/35) (`ready`).
- **Optional `HEARTBEAT_URL` for the backup cron** → [#36](https://github.com/kapekost/workout-tracker/issues/36) (`ready`).
