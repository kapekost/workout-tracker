# Public access via Cloudflare Tunnel — design

**Date:** 2026-08-31
**Status:** Drafted this tick from owner Q&A already recorded in `docs/orchestration/DECISIONS.md`
(2026-08-30 entry for #27). **Treat this one with more caution than a typical spec before acting on
it** — DECISIONS.md was explicit that this goes through a proper design pass "given the stakes,"
and the stakes here are a home network that also runs Home Assistant, not just this app. Needs an
owner skim before any execution, especially §4 (the proposed auth method) and §5 (the verification
checklist) — those are this spec's proposals, not decisions already on record.
**Depends on:** #67 (real login) before this can actually go *live* publicly — see §6. Provisioning
the tunnel itself has no code dependency on #66/#67 and could start in parallel, per DECISIONS.md.

---

## Problem

Original ask: reach the app from outside the home network, SSL-secured, without a VPN, for 3-4
people. Owner decided against migrating to a cloud host — keep the Raspberry Pi, expose it via
Cloudflare Tunnel instead of port-forwarding or a VPN. The hard constraint that makes this a real
design problem, not a quick config change: **the same Pi's home network also runs Home
Assistant.** Whatever ships must not create any new path toward Home Assistant or the rest of the
LAN, and needs an actual home-network security review — not just "the app's own code looks fine."

## Scope

**In:** Cloudflare Tunnel (outbound-only, no inbound port-forward on the home router); tunnel
ingress scoped to exactly this app's own service — nothing else; a second, edge-level
authentication layer (Cloudflare Access) restricting who can even reach the tunnel, since a tunnel
alone is transport, not access control (§2); an explicit, checkable verification list proving Home
Assistant and the rest of the LAN stay unreachable through the new public hostname (§5); sequencing
against real login (§6).

**Out:** migrating off the Pi (explicitly decided against). Any change to Home Assistant's own
setup — "scoped tightly to this app's own service/port, not the LAN" cuts both ways: this issue
doesn't touch Home Assistant, doesn't add it to the tunnel, and doesn't audit its configuration.
Building custom TLS/certificate handling (Cloudflare Tunnel issues and manages this automatically —
there's nothing to build). VPN-based approaches (the thing the original ask wanted to avoid).

---

## 1. Decisions already on record (owner Q&A, 2026-08-30)

| Question | Decision |
|---|---|
| Migrate to a cloud host (Vercel etc.), or keep the Pi? | Keep the Pi. |
| VPN, or something else? | Cloudflare Tunnel — SSL, no VPN, matches the original ask directly. |
| Home Assistant coexistence? | Hard requirement: scoped tightly to this app's own service/port, not the LAN. Needs a real home-network security review. |
| Sequencing against Profiles/auth? | "3-4 accounts" wants real auth first — follows #66–#69, though spec work can start in parallel. |
| How careful should this be? | Explicitly *not* a quick single-issue execution — a proper spec/brainstorm pass first (this document). |

## 2. Why a tunnel alone isn't enough — two independent layers

Cloudflare Tunnel solves **reachability**: it opens an outbound-only connection from the Pi to
Cloudflare's edge, so the public hostname gets a valid TLS cert and a route in, with no inbound
firewall rule or port-forward on the home router at all. That's a genuine security improvement over
the original port-forwarding idea, and it fully answers "SSL secure, no VPN." **It says nothing
about who's allowed to connect** — by itself, anyone with the hostname reaches whatever the tunnel
points at.

This spec proposes two independent gates, not one:

1. **Cloudflare Access** (Zero Trust, free tier) in front of the tunnel's public hostname — an
   email allow-list of the actual 3-4 people, enforced at Cloudflare's edge *before* any request
   reaches the Pi at all.
2. **The app's own login** (#67) — determines *which profile's* data the now-authenticated person
   sees.

Access answers "is this person allowed to reach the app at all"; the app's login answers "which of
our profiles are they." Given the Home Assistant constraint, defense in depth here is deliberate,
not overcautious — a vulnerability in the app itself still has to get past Access first.

## 3. Tunnel architecture — scoped to exactly this app

- `cloudflared` runs as an additional service (own small official Docker image, no build step —
  matches the existing app service's "run only, never build on the Pi" constraint in
  `docker-compose.yml`), on the **same Docker Compose network** as `workout-tracker`.
- **One tunnel, one ingress rule**: the public hostname maps to `http://workout-tracker:8000` (the
  Compose service's internal name/port — `docker-compose.yml`'s existing `8000` container port),
  reached over the internal Docker network. `cloudflared` never needs the host-published `8080`
  port at all; local LAN access via `8080:8000` is untouched and unaffected by any of this — the
  tunnel is a new, additive path in, not a replacement for local access.
- **Home Assistant is never added to this tunnel's ingress rules**, as part of this issue or ever
  without its own separate decision. One tunnel config, one rule, one service — not a shared
  gateway for "whatever's on this Pi."
- The real tunnel ID, hostname, and Cloudflare account details are deploy-specific — they belong in
  `AGENTS.local.md` (gitignored) per this repo's "deployment knowledge stays local" convention, the
  same as `DEPLOY_HOST`/`DEPLOY_APP_DIR` already do. Nothing about a real hostname or account goes
  in this spec or any other tracked file.

## 4. Access control — Cloudflare Access (proposed, not yet owner-confirmed)

- A Cloudflare Access application in front of the tunnel's public hostname.
- Policy: an allow-list of the specific email addresses for the "3-4 accounts" from the original
  ask. The free Zero Trust tier covers up to 50 seats — comfortably enough.
- Auth method: email one-time-PIN — no separate identity provider to stand up, appropriate for a
  small household. Cloudflare also supports Google/GitHub SSO and WebAuthn if ever wanted; not
  proposed for v1, since it adds setup complexity this scale doesn't need.
- **This is this spec's proposal, not a recorded owner decision** — flagged explicitly so it's easy
  to correct if the actual intent was different (e.g., relying on the app's login alone and skipping
  Access). Given the Home Assistant stakes, this document's recommendation is to keep both layers.

## 5. What must be verified before this goes live

DECISIONS.md asked for a real home-network security review, not just an assertion that the design
is safe on paper. This is the checklist that review should actually run through — concrete and
checkable, not just "looks fine":

- [ ] The tunnel's ingress config contains exactly one rule (public hostname → this app's service)
  — no catch-all/wildcard rule that could route to anything else on the network.
- [ ] From an external network, attempting to reach Home Assistant's own hostname/port through the
  new public hostname fails.
- [ ] The home router has no new inbound port-forward rule from this work — `cloudflared` is
  outbound-only by design; this confirms nothing was accidentally opened alongside it.
- [ ] Cloudflare Access's allow-list contains exactly the intended email addresses — no wildcard
  domain, no "anyone with a Cloudflare account" fallback.
- [ ] The app's own login (#67) is still enforced for every data-bearing endpoint once it ships —
  Access is a second gate, not a replacement for the first.
- [ ] `AGENTS.local.md`'s "Co-located services" section names Home Assistant and records this
  scoping decision, so it isn't rediscovered from scratch on a future deploy — the template
  (`AGENTS.local.md.example`) already anticipates exactly this kind of entry.
- [ ] Once the `docker-compose.yml` change adding the `cloudflared` service is actually written,
  run `/security-review` on that diff before it ships — this spec designs the shape, it doesn't
  replace reviewing the real config.

## 6. Sequencing

Blocked, for actually going *live* publicly, on #67 (real login) — Access alone identifies "an
allowed person," not "which account," and the original ask was access for 3-4 *accounts*,
plural and distinct. Provisioning and testing the tunnel + Access privately has no code dependency
on #66/#67 and can start in parallel, per DECISIONS.md — Access's own allow-list already gates it
even before the app has real login. But provisioned is not the same as done: this spec's
recommendation is that "done" means #67 is also live, not just that the tunnel responds.

## 7. What this issue does not decide

Whether or how Home Assistant itself might ever be made reachable from outside the home network is
a separate question, deliberately not addressed here. If that's ever wanted, it needs its own
decision and its own security review — this scoping boundary is exactly what keeps this issue's
blast radius to "this app only."

## 8. Next step

Owner skim — particularly §4's auth-method proposal and §5's checklist, since those are this
document's proposals rather than settled decisions — then split into `ready` work once #67 is far
enough along (or provisioning work in parallel, per §6).
