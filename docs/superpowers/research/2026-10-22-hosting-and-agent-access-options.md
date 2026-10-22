# Hosting and agent access options

Discovery spike, 2026-10-22. Vendor facts were fetched from the vendor's own pages on 2026-10-22
(URL given per claim). Anything not confirmed on a primary page is marked UNVERIFIED and must be
re-checked before it drives a decision. Prices are in the currency the vendor shows, and VAT is noted
where the vendor says so. The fetch tool summarises pages, so numbers are as reported by that summary,
not read off the raw HTML.

## 0. Starting point

- One image: FastAPI plus a SQLite file on a volume, serving the built React app. `DATABASE_URL`,
  `APP_BASE_URL`, `APP_COOKIE_SECURE`, `RESEND_API_KEY`, `MAIL_FROM` and `APP_COMMIT` are already
  environment variables, and `/api/health` exists. That is most of twelve-factor already.
- Today's hard rules (no registry, `pull_policy: never`, build off-device) exist because the Pi has
  1 GB of RAM. They are Pi constraints, not product constraints, and a cloud move revisits rules 1 and 2.
- The Dockerfile hardcodes an arm64 rollup binary (`@rollup/rollup-linux-arm64-musl`) in the Alpine
  build stage. An amd64 build needs the matching x86 musl binary, so the image build is not yet
  multi-arch. This is a real migration task for any amd64 target and for any `buildx` multi-arch build.
- Worker contract (from the coach spec, "Two sides, two credentials" and "Swappable worker"): four
  calls (claim, context, result, run report), a separate machine credential that cannot touch plans,
  profiles or sessions. Open question 1 asks how the external agent reaches the app. This document
  answers it.

## 1. How the external agent reaches the worker endpoints

The agent is a scheduled Claude session on the owner's machine. Three facts shape the choice. The
agent only makes a handful of small HTTPS calls per run. It needs no inbound path to itself. The
worker credential already limits what a caller can do, so transport only has to keep that credential
and the context payload (health-adjacent data) away from the open internet.

| Option | Security posture | Setup effort | Failure modes | Cost |
|---|---|---|---|---|
| A. LAN-only agent | Best: nothing new is exposed. The credential never leaves the LAN. | None, if the agent host is on the same LAN. | Agent only works when the owner's machine is at home. A laptop away from home skips runs. Breaks when the app moves to a cloud host (then it becomes option F or E). | Free |
| B. Tailscale tailnet (agent and Pi both on the tailnet, no Funnel) | Strong: WireGuard, device identity, ACLs can restrict the agent to one port. Endpoint stays non-public. | Low: install on both, one ACL. | Depends on Tailscale coordination service for new connections. Machine asleep or logged out means no run. | Personal plan is $0, up to 6 users, unlimited user devices (https://tailscale.com/pricing, 2026-10-22). |
| C. Tailscale Funnel | Public URL on a Tailscale-provided domain, only ports 443, 8443 and 10000, TLS ends on the Pi, relays see ciphertext only (https://tailscale.com/kb/1223/funnel, 2026-10-22). Anyone on the internet can reach it, so the app's own credential check and a rate limit are the only gate. Bandwidth limits are non-configurable and Funnel needs a `funnel` node attribute in the policy. | Low. | Throttling you cannot tune. Mixes app-wide exposure (all routes) unless the proxy path-filters to `/api/worker/*`. Whether the free plan includes Funnel: UNVERIFIED (the pricing page did not say). | UNVERIFIED for the free plan. |
| D. Cloudflare Tunnel plus Access service token | `cloudflared` makes outbound-only connections, so the Pi opens no inbound port (https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/, 2026-10-22). Access service tokens add a second, independent credential: `CF-Access-Client-Id` and `CF-Access-Client-Secret` headers, Service Auth policy, expiry you set, rotation with a 1 hour to 30 day grace (https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/, 2026-10-22). Cloudflare sits in the TLS path and sees plaintext unless re-encrypted (the tunnel page did not state this: UNVERIFIED, assume it does). | Medium: needs a domain on Cloudflare (requirement not stated on the page that was fetched: UNVERIFIED), a tunnel, an Access app and policy. Could also front the mobile app. | Token expiry silently ends runs. A tunnel or Cloudflare outage cuts the agent. Two credentials to rotate. | Account limits page: 1,000 tunnels, 50 service tokens (https://developers.cloudflare.com/cloudflare-one/account-limits/, 2026-10-22). Free-plan price and user cap: UNVERIFIED (the plan page did not show them). |
| E. Reverse SSH tunnel (Pi dials out to a small VPS) | Good if the VPS is hardened, but you now run and patch a public host. | Medium to high: the Pi side needs autossh or a systemd unit, the VPS side needs sshd hardening and a reverse proxy. | Tunnel drops silently, the VPS is a new single point of failure and a new attack surface. | VPS cost (section 2). Pointless if the app moves to that VPS anyway. |
| F. Public route with scoped token and rate limit | Acceptable only if the worker credential is a long random bearer token, stored hashed, bound to the four routes, with per-token rate limit and audit log. All user routes stay behind session auth already. | Low in code, but needs the app on a public host with TLS. | Token theft equals read access to every user's minimised context until rotated. Abuse and scanning noise. | Free |
| G. Outbound-only: agent pulls from a store | The app never accepts inbound calls from the agent. The app writes a minimised, per-item job file to object storage, the agent polls the bucket and writes results back, the app ingests results. Smallest attack surface on the app, but the bucket becomes the sensitive surface and needs its own credential and encryption. | Highest: new store, new ingest job, change to the worker contract (claim becomes a file lease). | Races on claim, eventual consistency, extra latency, two places to keep correct. | R2: free tier 10 GB-month, 1M Class A and 10M Class B ops, $0.015 per GB-month beyond, no egress fee (https://developers.cloudflare.com/r2/pricing/, 2026-10-22). EU jurisdiction option: UNVERIFIED. Backblaze B2: $6.95 per TB-month, first 10 GB free, egress free up to 3x stored (https://www.backblaze.com/cloud-storage/pricing, 2026-10-22). EU region: UNVERIFIED. |

Assessment:

- While the app is on the Pi and the agent runs on the owner's machine, option A or B is enough and
  adds no public surface. B removes the "must be at home" limit at no cost and keeps the endpoint
  non-public. Choose B.
- After a move to a cloud host the agent simply calls the public HTTPS URL (option F). It is then the
  same as any API client, and the worker credential design already supports it. Do not build G: it
  changes the contract and adds a second data store for a problem the token already solves.
- Funnel and Tunnel only matter if the Pi stays the production host and friends need to reach it from
  mobile. That is a reason to move to cloud, not a reason to harden the Pi's exposure.
- Whatever the transport, treat the worker token as a bearer secret: hash it at rest, show it once,
  scope it to the four routes, cap request rate, log every use, and make rotation a documented
  command. Answers Open question 1 for the spec: B now, F after migration.

## 2. Cheap or free cloud hosting for one container with a persistent SQLite volume

Footprint assumed: 1 shared vCPU, 256 to 512 MB RAM, 1 GB volume, a few GB per month of traffic.
All prices are the vendor's list prices on 2026-10-22.

| Provider | Real cost for this footprint | Free tier and gotchas | EU region | Persistent disk | Image arch | Backups | Sleep and cold start | Lock-in |
|---|---|---|---|---|---|---|---|---|
| Fly.io | shared-cpu-1x: $2.19 per month at 256 MB, $3.69 at 512 MB (quoted for Ashburn and Secaucus only; the EU price is UNVERIFIED), volume $0.15 per GB-month, so roughly $2.50 to $4 per month plus $2 per month if a dedicated IPv4 is wanted (https://docs.fly.io/about/pricing, 2026-10-22). | No free allowance for new organisations: a trial of up to 2 hours of Machine runtime or 7 days. Free: first 10 GB of snapshot storage, shared IPv4, IPv6, inbound traffic. Egress in Europe $0.02 per GB. | Amsterdam, Stockholm, Paris, Frankfurt (https://docs.fly.io/reference/regions, 2026-10-22). | Yes, a volume lives on one host, attaches to one Machine, is not replicated; Fly itself says snapshots are not a primary backup and to run at least two volumes (https://docs.fly.io/volumes/overview, 2026-10-22). | Either (not stated on the pages fetched: UNVERIFIED for arm64 Machines). | Daily snapshots, 5 days default, configurable 1 to 60 days. Not enough alone: use Litestream. | Machines can stop and start on demand; the autostop page was not fetched, so cold-start time is UNVERIFIED. | Low. A Dockerfile plus `fly.toml`. Closest fit to the current one-container model. |
| Railway | Hobby plan $5 per month, includes $5 of usage. Rates: RAM $10 per GB-month, CPU $20 per vCPU-month, volume $0.15 per GB-month, egress $0.05 per GB (https://docs.railway.com/reference/pricing/plans, 2026-10-22). A 512 MB, light-CPU service plus 1 GB volume lands near or above the credit, so about $5 to $8 per month (estimate, based on the listed rates). | Free and trial plan caps: 0.5 GB RAM, 0.5 GB volume. Hobby volume max 5 GB. | Amsterdam (europe-west4), among four regions (https://docs.railway.com/reference/regions, 2026-10-22). | One volume per service; redeploy causes brief downtime even with a healthcheck (https://docs.railway.com/reference/volumes, 2026-10-22). | Not stated: UNVERIFIED. | Manual and automated volume backups exist (details not fetched: UNVERIFIED). | No cold start stated. | Low to medium. |
| Render | Free web services cannot have a persistent disk, spin down after 15 minutes idle (about one minute to wake) and get 750 hours per month (https://render.com/docs/free, 2026-10-22). Disk needs a paid service. The Starter price and the disk price per GB were NOT shown on any page that fetched: UNVERIFIED. | A disk means a single instance and no zero-downtime deploys: the old instance stops first, with a few seconds of downtime. One snapshot per 24 hours, kept at least 7 days, whole-disk restore only (https://render.com/docs/disks, 2026-10-22). | Frankfurt (https://render.com/docs/regions, 2026-10-22). Region cannot be changed later. | Yes, paid only. | UNVERIFIED. | Daily snapshots (above). | Paid instances do not sleep. Free ones do, but are useless here. | Low. |
| Hetzner Cloud | CX23 (2 vCPU x86, 4 GB, 40 GB NVMe, 20 TB traffic) EUR 5.99 per month, CAX11 (2 vCPU Arm, 4 GB, 40 GB) EUR 6.49 per month, both excl. VAT (https://www.hetzner.com/cloud/cost-optimized, 2026-10-22). Backup option from EUR 1.198 per month excl. VAT. | Both plans showed "This product is currently unavailable" on the fetch, so availability must be checked in the console before relying on it. UNVERIFIED why. | Nuremberg, Helsinki (Falkenstein may also apply; the page was inconsistent). Germany and Finland (https://www.hetzner.com/cloud/, 2026-10-22). | Yes, local NVMe, plus a VPS you manage. | Both x86 and Arm. | Optional provider backups, plus Litestream. | Always on. | Lowest: it is a plain Linux box. You own patching, TLS, firewall and updates. |
| Oracle Cloud Always Free | Free for the life of the account: 2 OCPU and 12 GB of Ampere A1 total (arm64, same arch as the Pi), up to two AMD micro VMs (1 GB each), 200 GB block storage with 5 volume backups, 10 TB per month outbound (https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm, 2026-10-22). | Idle reclamation: an instance is idle if over 7 days CPU p95 is under 20%, network under 20% and (A1 only) memory under 20%. A light app like this will look idle. The home region is chosen at signup and Always Free resources must live in it. Capacity availability of A1 shapes: UNVERIFIED. | A European home region can be picked at signup. | Yes. | arm64 (A1) or amd64 (micro). | Block volume backups (five, included). | Always on, but see the reclamation risk. | Low technically; high operational risk of silent reclamation. |
| Google Cloud Run | The pricing page returned only a title in two fetches, so the free tier and rates are UNVERIFIED. | No persistent local disk. The Cloud Storage FUSE mount does not offer file locking, "last write wins", is not fully POSIX, and flushes only on close or fsync (https://docs.cloud.google.com/run/docs/configuring/services/cloud-storage-volume-mounts, 2026-10-22). The page does not mention SQLite, but those properties make a live WAL database on it unsafe. | Yes (Belgium and Netherlands regions exist; not confirmed on a fetched page: UNVERIFIED). | Not for SQLite. | amd64 mainly (UNVERIFIED). | n/a | Scales to zero and cold starts. | Cloud Run fits only with Postgres or Litestream restore on boot. Reject for this app as it stands. |
| Plain VPS (any provider) | See Hetzner. | You own the OS. | Choose. | Yes. | Choose. | Provider snapshots plus Litestream. | None. | Lowest. |
| Koyeb (managed container alternative) | UNVERIFIED. The pricing page (`/docs/reference/pricing`) returned 404 and I did not locate another primary page. | UNVERIFIED. | UNVERIFIED. | UNVERIFIED. | UNVERIFIED. | UNVERIFIED. | UNVERIFIED. | Low (container based). |

Reading of the table:

- Cheapest and most professional on paper: Fly.io with a volume and Litestream, around $3 to $4 per
  month plus object storage (R2 or B2 costs for this database size would be cents; the free storage tiers
  quoted above cover it, but treat that as an estimate).
- Cheapest in cash: Hetzner CAX11 at EUR 6.49 per month, with the most control and the most chores.
  Because it is plain Linux, the current compose file works almost unchanged and the Pi and VPS can be
  run in parallel during cutover.
- Oracle Always Free costs nothing and is arm64, but the idle-reclamation rule is aimed at exactly this
  kind of low-load workload. Acceptable only as a secondary or disaster-recovery target, not as the
  primary home.
- Render and Railway work but cost a bit more than Fly for the same shape, carry deploy downtime with a
  volume, and neither of the prices that decide the comparison for Render could be verified.
- Cloud Run: reject until the database is Postgres.
- GDPR: any EU region above gives EU residency. The data processor agreement, sub-processor list and
  each vendor's own residency terms were not reviewed here and need a read before real friends' data
  goes live. UNVERIFIED.

## 3. SQLite durability in the cloud

| Approach | What it gives | Cost to adopt | Costs and limits |
|---|---|---|---|
| Volume snapshots only | Daily block snapshot (Fly keeps 5 days by default, up to 60; Render keeps at least 7 days) | None | Up to a day of data lost, and the vendor says a single volume is at risk of loss on drive failure. Not enough as the only copy. |
| Litestream | Asynchronous streaming of WAL pages to object storage. Restores to the latest replicated transaction. Defaults: compaction every 30 s, 5 min and 1 hour, full snapshot every 24 hours, 24 hour retention (https://litestream.io/how-it-works/ and https://litestream.io/, 2026-10-22). | Small: run it as a sidecar or as a process wrapper, set the bucket, add a restore-on-boot step. No schema or code change, and the app keeps SQLite. Today's WAL journalling is already the required mode. | Asynchronous, so a crash can lose the not-yet-synced tail; the pages fetched give no figure for the window (UNVERIFIED). One writer only. Replica must be monitored. Upgrading from v0.3.x to v0.5 needs the migration guide (start on v0.5). It does not replace the app's own `GET /api/export` and the weekly offsite copy in `docs/BACKUPS.md`. |
| Move to Postgres | Network database, point-in-time recovery from a managed service, multiple app instances, Cloud Run compatible. | High. The backend uses SQLite-specific pieces (`VACUUM INTO`, `PRAGMA user_version`, WAL, the import and export routines, `INSERT OR ...` style statements). Expect a query dialect pass, a migration tool, rewritten backup and restore paths, and a restore drill. Managed Postgres typically costs more than the whole app host (price UNVERIFIED here). | Overkill for one writer and a few users. |

Recommendation: stay on SQLite and add Litestream when the app leaves the Pi. Revisit Postgres only
if one of these happens: more than one app instance is needed, writes become heavy, or the host must
scale to zero. Keep SQL access behind the existing functions so a later swap stays contained.

## 4. What to do now so a later move is cheap

These are small changes. Each keeps the current Pi deploy working.

1. Config. Already env-driven. Add a `/api/health` check to the Dockerfile as `HEALTHCHECK` and to
   the compose file. Add a `.env.example` entry for any new setting (worker token hash source, S3
   bucket values) so there is one documented list.
2. Image tag convention. Keep the commit-SHA tag. Add the OCI revision label and a `latest`-free policy
   so rollback is always "run an older SHA".
3. Multi-arch build. Make the Dockerfile arch-neutral: pick the rollup native package from the
   build platform instead of hardcoding arm64-musl. Without this, an amd64 host (Fly, Render, most
   VPS options) cannot build the image. Build with `buildx` for `linux/arm64,linux/amd64`.
4. Registry question. The no-registry rule is a Pi-memory rule. A cloud host pulls from somewhere, and
   Fly builds from a Dockerfile or accepts an image you push to its own registry. The simplest
   option is to relax the rule narrowly: CI builds the multi-arch image and pushes it to a private
   registry that the target pulls from, and the Pi keeps the `docker save` path as a fallback. This
   is an owner decision (DECISIONS.md) because AGENTS.md calls the rule hard. Do not build a registry
   project for this; use the registry the chosen host provides or GitHub's container registry, whose
   pricing and private-image rules were not verified here (UNVERIFIED).
5. Secrets. Keep them in the host's secret store or an env file outside git, as today. Add the worker
   token as a hashed value in the database, not a plaintext env var.
6. `DATABASE_URL`. It is a file path today, not a URL. Rename later only if Postgres is ever chosen;
   until then the path is fine and a rename adds nothing.
7. CI deploy. Today deploys are manual from the owner's machine. Add a CI job that builds and pushes
   the image on merge to `main`, and a manual-approval deploy step that calls the host's CLI. Keep
   the "verify `/api/health` returns the new SHA" step from `deploy.sh`.
8. Backups. Keep `docs/BACKUPS.md` as the single reference and extend it with the Litestream level.
   Run a restore drill from the new replica before the first friend signs up.
9. Time zone. `TZ=Europe/London` is hardcoded in compose. Store timestamps in UTC and keep the zone as
   a setting, so a cloud default of UTC does not move workout dates.

## 5. Migration path, Pi to cloud

1. Decide the host (section 6) and record it in DECISIONS.md, including the registry relaxation.
2. Make the Dockerfile multi-arch and add `HEALTHCHECK`. Verify the image on both architectures.
3. Add the CI build and push job. Keep the Pi path working.
4. Create the cloud app in the chosen EU region with a volume and the same environment variables.
   Restrict `APP_BASE_URL` and `APP_COOKIE_SECURE=1` to the new public HTTPS URL, since cookies break
   silently otherwise (see AGENTS.md).
5. Add Litestream with an EU object-storage bucket. Run a restore into a scratch location and check
   `PRAGMA integrity_check` and row counts.
6. Take an admin `GET /api/export` snapshot from the Pi. Import it into the new host with
   `POST /api/import` (mode replace). Remember that restore logs everybody out and that envelopes
   lacking password hashes need the break-glass command.
7. Run both for a short parallel period, writes only on the Pi. Freeze the Pi (stop the container),
   take a final export, import it, and flip DNS or the app URL. A short write freeze is acceptable
   for a handful of users.
8. Point the coach agent at the new HTTPS URL with the worker token (option F), and point the mobile
   client at the same base URL.
9. Keep the Pi as a cold standby for a few weeks, with its last snapshot, then retire it. Keep an
   offsite copy of the final export.

What stays the same: the image, the SQLite schema and its v9 envelope, the HTTP API, the session
cookie auth, the export and import routes, the worker contract (claim, context, result, run report), and
the mobile client (it only needs a base URL setting). What changes: where the image is built and
pulled from, the base URL, TLS termination (now by the host, so the cookie secure flag turns on), and
how the agent reaches the worker endpoints.

## 6. Recommendation and ranking

Ranking for "free or very cheap, EU, easy migration, professional":

1. Fly.io in Amsterdam, Frankfurt or Paris, one Machine with a 1 GB volume, Litestream to an EU
   bucket. About $3 to $4 per month on the quoted US prices (EU price UNVERIFIED), plus cents of storage.
   It matches the one-container shape, has EU regions, and its own docs tell you not to rely on
   snapshots alone, which Litestream covers.
2. Hetzner Cloud CAX11 (arm64, same architecture as the Pi) at EUR 6.49 per month excl. VAT, running the
   existing compose file, with Litestream. Choose this if you would rather run a box than learn a
   platform. Check the "currently unavailable" banner first.
3. Railway Hobby (Amsterdam) or Render paid in Frankfurt. Workable; both cost a little more and both
   restart with downtime when a volume is attached.
4. Oracle Always Free: as a free secondary or standby only.
5. Cloud Run and anything needing Postgres first: not for now.

Until the move: agent over LAN or a tailnet (option A or B), no public exposure of worker routes.

Top three risks:

1. Data durability. A single volume on any of these providers is a single point of failure, and
   Litestream is asynchronous. Mitigate with Litestream plus the weekly export plus a restore drill
   before friends join. The off-site Google Drive path is in `Testing` status with weekly token
   expiry (see `docs/BACKUPS.md`), so do not make it the cloud backup.
2. Compliance for health-adjacent data of other people. The owner holds the data of friends once the
   mobile app ships. EU hosting is necessary but not sufficient: consent text, retention (Open question
   2 in the spec), deletion on profile removal, processor agreements and a sub-processor review are
   still open, and none was verified here.
3. Credential and exposure drift. The worker bearer token is long-lived, and a move makes the worker
   routes public. Without hashing, scoping, rate limits, audit and rotation, one leaked token exposes
   every user's minimised context. Cloudflare Access service tokens expire silently and Oracle can
   reclaim idle instances silently; both fail without a loud signal, so add a health or heartbeat
   check for the agent run.

## 7. Could not verify

- Fly.io EU instance price, arm64 support on Fly, and autostop cold-start time.
- Render Starter instance price and persistent disk price per GB; Render and Railway image architecture.
- Hetzner: why the plans showed as unavailable, and which of Falkenstein, Nuremberg or Helsinki apply to CAX11.
- Google Cloud Run free tier and prices (the page returned only a title), and its EU region list.
- Koyeb (page returned 404) and any other managed-container pricing.
- Tailscale Funnel on the free plan; Cloudflare Zero Trust free plan price and user cap; whether a
  domain must be on Cloudflare; whether Cloudflare terminates TLS on the tunnel.
- R2 and B2 EU data location options; Litestream data-loss window; GitHub container registry terms.
- Oracle A1 capacity availability in an EU region.
- Any GDPR processor terms, which need a human read.
