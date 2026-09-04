# Accounts: login gate + emailed invite/reset — design

**Issues:** #67 (username/password login + gate) and #68 (forgot-password via email), merged
into one workstream.
**Status:** Owner-approved in chat 2026-09-04. Every fork below is either an owner decision on
record or a measurement taken on the real deploy target — nothing here is guessed.
**Depends on:** #66 (profiles schema v4) and #69 (schema v5), both shipped and deployed.

---

## Why #67 and #68 merged

#68's original text said it depended on #67 ("needs the login/account system to exist first").
The owner's 2026-09-02 comment inverted that:

> "Set initial password after a secure single use link provided in the email"

If initial passwords are set through an emailed link, #67 cannot ship a working account without
the Resend integration and single-use token model that live in #68. Neither can precede the
other, so they are one piece of work.

## Owner decisions on record

| Question | Decision | Source |
|---|---|---|
| Email provider | Resend, same as `kapekost-web`. API key in `AGENTS.local.md`, never tracked. | #68 comment, 2026-09-02 |
| Account creation | Creating a profile emails a single-use, time-limited link; the recipient sets their own initial password. No password field at creation time. | #68 comment, 2026-09-02 |
| Self-signup | No. Admin invites only. | Chat, 2026-09-04 |
| Admin bootstrap | Schema adds `email`; a one-off script sets the owner's address on the seeded profile and mails a normal invite. No backdoor. | Chat, 2026-09-04 |
| Public URL dependency | Do not block on #27. Emailed links point at the Tailscale URL now; the Cloudflare Tunnel hostname replaces it later via one config value. | Chat, 2026-09-04 |
| Export/import access | Admin gets the full multi-profile dump; members get only their own rows. | Chat, 2026-09-04 |
| Backup heartbeat | Stop POSTing to `/api/events`. `backup.sh` writes a status file the app reads. Tracked separately — see "Out of scope". | Chat, 2026-09-04 |

## Measurements taken on the deploy target

Both were run on the actual Pi (Raspberry Pi 3 B+, aarch64, 4 cores, ~185 MiB free) rather than
assumed, because the Dockerfile deliberately ships no build tools and the box is shared with
Home Assistant.

**Key-derivation cost**, in the running container:

| Algorithm | Time |
|---|---|
| scrypt N=2¹³ r=8 p=1 (~8 MB) | 79 ms |
| scrypt N=2¹⁴ r=8 p=1 (~16 MB) | 159 ms |
| scrypt N=2¹⁵ r=8 p=1 (~32 MB) | 378 ms (needs `maxmem` raised; default OpenSSL limit rejects it) |
| pbkdf2-sha256 200k | 563 ms |
| pbkdf2-sha256 600k (OWASP guidance) | 1690 ms |
| bcrypt cost 10 | 157 ms |
| bcrypt cost 11 | 314 ms |
| **bcrypt cost 12** | **627 ms** |
| bcrypt cost 13 | 1253 ms |

**Wheel availability** for `linux aarch64` / cp314, checked with `pip download --only-binary`:
`bcrypt` resolves to a single dependency-free `abi3` wheel; `argon2-cffi` additionally pulls
`cffi` and `pycparser`. Neither needs gcc, so the no-build-tools constraint survives either way.

### Why bcrypt cost 12, and not a memory-hard KDF

Current OWASP guidance for scrypt starts at N=2¹⁷ (128 MiB), which exceeds free memory on this
box outright; their PBKDF2 setting costs 1.7 s per login here. This hardware cannot reach those
parameters at usable latency, so the choice is which way to fall short.

Memory-hard KDFs are the wrong way to fall short *on this specific machine*. Each concurrent
hash reserves its full working set — at N=2¹⁵ that is ~32 MB, so a handful of parallel requests
to an unauthenticated login endpoint could OOM a container on a box with ~185 MiB free and Home
Assistant running beside it. The failure mode is a killed container, and it gets easier to reach
once #27 exposes the app publicly.

bcrypt uses ~4 KB per hash regardless of cost, so concurrency is bounded by CPU rather than RAM.
Cost 12 clears OWASP's bcrypt floor (≥10) with margin at 627 ms, and CPU contention degrades
service instead of killing it — the better failure mode on a shared box. Rate limiting (below)
covers the remaining CPU exposure.

## Schema v6

```sql
ALTER TABLE profiles ADD COLUMN email TEXT;              -- nullable; UNIQUE index below
CREATE UNIQUE INDEX idx_profiles_email ON profiles(email) WHERE email IS NOT NULL;

CREATE TABLE auth_tokens (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,   -- SHA-256 of the token; the raw value is never stored
    kind       TEXT NOT NULL CHECK(kind IN ('invite', 'reset')),
    expires_at TEXT NOT NULL,
    used_at    TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_auth_tokens_profile ON auth_tokens(profile_id);

CREATE TABLE auth_sessions (
    id         TEXT PRIMARY KEY,       -- opaque 32-byte urlsafe random
    profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_auth_sessions_profile ON auth_sessions(profile_id);
```

`auth_sessions` is named to avoid collision with the existing workout `sessions` table. A partial
unique index on `email` is used rather than a plain `UNIQUE` column so that multiple profiles may
keep a NULL email without colliding.

**Neither new table joins `TABLES` or `TABLE_INTRODUCED_AT`**, so both stay out of the export
envelope entirely. Sessions and tokens are ephemeral credentials, not user data: restoring a
backup must never resurrect a live session or an unused invite, and a backup file should not be
a store of credential material in the first place.

`profiles.email` *is* new envelope content, but it lands on a table already introduced at v4, so
existing envelope-compatibility rules cover it — an import from a v4/v5 envelope simply leaves
`email` NULL, which is a valid state meaning "not yet invited".

## Password hashing

`bcrypt.hashpw` at cost 12, verified with `bcrypt.checkpw`. `profiles.password_hash` stays
nullable, and NULL now carries a precise meaning: **this account cannot authenticate with a
password and must go through an invite.** The seeded `kapekost` profile is in exactly that state
today, which is what makes the bootstrap path below the same code path as any other invite.

bcrypt silently truncates input beyond 72 bytes, so passwords are length-capped at 72 with a
validation error rather than a silent truncation. Minimum length 12, no composition rules — the
current NIST position.

## Sessions

An opaque 32-byte urlsafe random id, stored as an `auth_sessions` row and returned in a cookie:

```
Set-Cookie: wt_session=<id>; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000   (+ Secure once HTTPS)
```

30-day expiry, appropriate for a phone-first app opened a few times a week. `Secure` is driven by
an `APP_COOKIE_SECURE` config flag: off for the current plain-HTTP tailnet URL, on once #27's
tunnel terminates TLS. Shipping `Secure` before HTTPS exists would silently break login.

Server-side rather than a stateless signed cookie for one reason that matters here: **a password
reset must invalidate every existing session.** A self-contained signed token cannot be revoked
before it expires, which would leave a stolen session alive for its full lifetime after the very
event that is supposed to end it. The cost is one indexed SQLite lookup per request, which is
nothing next to a 627 ms hash.

Expired rows are deleted opportunistically on lookup; no separate reaper process.

## Invite and reset — one mechanism

Both mint an `auth_tokens` row and send the same email shape. They differ only in `kind`,
expiry, and what triggers them.

```
admin creates profile (username + email)
        │
        ├─→ mint token kind='invite', expires in 7 days
        │
forgot-password (email submitted)
        │
        └─→ mint token kind='reset', expires in 1 hour
                │
                ▼
   Resend sends {APP_BASE_URL}/set-password?token=<raw>
                │
                ▼
   POST /api/auth/set-password {token, password}
                │
                ├─ token unknown / expired / already used → 400, generic message
                └─ valid → hash password, mark used_at,
                           DELETE every auth_sessions row for that profile,
                           issue a fresh session cookie
```

Only the SHA-256 of the token is stored, so a database read — including a leaked backup — cannot
be replayed into account access. The raw value exists only in the email.

Expiries differ because the threats differ: an invite is sent to someone who is expecting it and
may not act for days; a reset can be triggered by anyone who knows an address, so its window is
short.

**Enumeration:** `POST /api/auth/forgot-password` always returns 200 with the same body, whether
or not the address exists. Same for timing — the handler does the same work either way.

**Reset on a NULL-hash account** issues an invite-equivalent rather than an error, so a member who
never opened their invite can still self-serve.

**Send failure:** the profile is created regardless; the admin gets a clear "profile created, invite
email failed" response and a re-send action, rather than a half-created account or a 500.

## The gate

A `current_profile` FastAPI dependency reads the cookie, validates the session, and returns the
profile row — 401 otherwise. It replaces all seven `_default_profile_id` call sites, and
`_default_profile_id` is deleted, which its own comment has always anticipated:

> Every call site below is removed/replaced in #67, not extended further.

Unauthenticated surface, and nothing else:

| Route | Why |
|---|---|
| `/api/health` | The deploy script's smoke check. Trimmed to `{status, version}`. |
| `/api/auth/login`, `/set-password`, `/forgot-password` | Needed to obtain a session. |
| static assets, `/` | The SPA shell; it renders the login screen itself. |

`/api/health`'s `last_backup_at` / `last_backup_status` move behind admin auth. A publicly
reachable endpoint should not publish backup posture, and after #27 this one is public.

`/api/events` becomes session-gated. It is currently an unauthenticated write, and the only
non-browser caller is the backup heartbeat — which the file-based change removes (see Out of
scope). **That change must land before or with this one**, or nightly backups start reporting
failure. The two are ordered together in the implementation plan for that reason.

## Export and import

`/api/export` and `/api/import` require a session, and branch on `role`:

- **admin** — export dumps every profile's rows; import restores the whole envelope, exactly as
  today. This preserves the disaster-recovery path the backup and restore drill depend on.
- **member** — export returns only the caller's rows; import merges into the caller's profile,
  ignoring any `profile_id` in the envelope so a crafted file cannot write into another account.

The restore path is the most safety-critical code in the app (#38 hardened it deliberately), so
the member branch is additive: the admin path keeps its existing behaviour and its existing tests
unchanged, and the member branch gets its own tests including the cross-profile write attempt.

## Rate limiting

`/api/auth/login` and `/api/auth/forgot-password` only. A fixed window counted in memory, keyed by
IP and by username: 10 attempts per 15 minutes, then 429.

In-memory is honest for a single-container deployment — there is one process, so there is nothing
to share state with, and a restart clearing counters is acceptable for this threat. A table would
add write amplification on the login path for no benefit at this scale.

This exists because cost-12 hashing is 627 ms of CPU on a 4-core box that also runs Home
Assistant; an unthrottled login endpoint is a CPU amplifier pointed at the house.

## Configuration

New values in `AGENTS.local.md`'s config section, injected as container env vars:

| Variable | Now | After #27 |
|---|---|---|
| `APP_BASE_URL` | `http://100.65.191.3:8080` | the tunnel hostname |
| `APP_COOKIE_SECURE` | `0` | `1` |
| `RESEND_API_KEY` | Resend key | unchanged |
| `MAIL_FROM` | verified sender address | unchanged |

`AGENTS.local.md.example` gains the same keys with placeholder values. Nothing real is tracked.

The Tailscale IP is known to drift — it silently broke gym access in July. `APP_BASE_URL` being a
single config value is what keeps that from becoming a code change; #27's stable hostname retires
the problem.

## Frontend

- `pages/Login.jsx` — username + password, plus a "forgot password" link.
- `pages/SetPassword.jsx` — reads `?token=`, posts a new password, lands the user on Home.
- A route guard wrapping the existing routes in `App.jsx`; unauthenticated renders `/login`.
- `api.js` gains a central 401 handler that redirects to `/login`. Cookies need no fetch change —
  requests are same-origin, so they are sent by default.
- `TopBar` (from #69) gains a logout action alongside the profile icon it already shows.

Admin-only profile creation is a small admin screen, not a public signup form.

## Testing

TDD throughout; the repo currently has 88 backend and 210 frontend tests plus a 12-test Playwright
suite, all of which must stay green.

Backend, the cases that matter:
- token single-use (a second redemption fails), expiry, and wrong-kind rejection
- password reset revokes every existing session for that profile
- **every data endpoint 401s without a session** — table-driven over the route list, so a route
  added later without a gate fails the suite rather than shipping open
- member export contains only the caller's rows; a member import naming another `profile_id`
  cannot write to it
- forgot-password returns an identical response for known and unknown addresses
- rate limiter returns 429 at the threshold
- migration v5 → v6 on a populated database preserves every row
- envelopes at schema ≤5 still import

Frontend: guard redirects when unauthenticated, login submits and lands Home, set-password
handles an expired token, logout clears state.

Resend is faked at the boundary in tests. The bootstrap is the first real send, deliberately —
it proves the integration on real infrastructure before anyone else is invited.

## Implementation order

Four issues. The order is a hard dependency chain, not a preference: flipping the gate before the
invite flow and the bootstrap both work locks the owner out of their own history.

1. **Schema v6 + auth core** — migration, bcrypt, `auth_sessions`, `current_profile` dependency,
   login/logout endpoints. The gate is *not* yet applied to data endpoints.
2. **Resend + invite/reset** — token minting, email send, `/api/auth/set-password`,
   `/api/auth/forgot-password`, rate limiting, the bootstrap script.
3. **Gate flip + shim removal** — apply `current_profile` to all data endpoints, delete
   `_default_profile_id`, trim `/api/health`, gate `/api/events`, frontend guard and login pages.
   Ships together with the backup heartbeat change so nightly backups never see a gated
   `/api/events`.
4. **Export/import roles** — the member branch, on top of the unchanged admin path.

Steps 1 and 2 are safe to deploy while the app is still open, because nothing enforces
authentication until step 3. That is deliberate: it keeps each deploy small and reversible, and it
means the bootstrap invite can be tested for real before the gate closes.

## Out of scope, tracked separately

- **Backup heartbeat → status file**, and `/api/health`'s staleness threshold following the cron
  schedule to weekly. Ordered with step 3 above; its own issue.
- **Backup alerting** (`HEARTBEAT_URL` → healthchecks.io). Three nights of failed off-site backups
  passed unnoticed this week because staleness is a pull signal. Own issue.
- **Google/Apple OAuth** — deferred at #66, still deferred.
- **#27 public access** — this design is deliberately independent of it; `APP_BASE_URL` and
  `APP_COOKIE_SECURE` are the only two seams it touches.
- **#70 cross-user competition** — needs real accounts first; unblocked by this work, not part of it.
