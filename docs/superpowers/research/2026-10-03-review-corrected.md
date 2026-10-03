# Review — corrected, re-verified against `main`

Date: 2026-10-03 (supersedes the 2026-10-02 draft of this file)
Base reviewed: `main` @ `94204ba`, plus this branch's fixes
Reviewer: Claude (Opus) — engineering (Python/FastAPI/SQLite, React), UI/UX,
architecture, software security, AI-agent security

---

## Read this first: the first version of this review was wrong

The 2026-10-02 draft of this document reported **four Critical/High security
findings against an unauthenticated `POST /api/import`** that could wipe the
database. Those findings were **false**. They were real for the branch the
reviewer happened to be on, which had diverged from `main` and sat 59 commits
behind it. Against `main`:

```
GET /api/sessions   -> 401      POST /api/import  -> 401
GET /api/notes      -> 401      POST /api/sessions -> 401
GET /api/progress   -> 401
GET /api/export     -> 401
GET /api/plan       -> 401
```

`#86` closed the gate. `main` also already contains, verbatim, the
seeded-admin protection the first draft proposed as a fix:

> `envelope contains no admin profile; refusing to replace the database`

and `#87`'s recorded decision that any authenticated profile may reach import,
with role selecting the write strategy.

**How it happened, because the mechanism matters more than the mistake:** the
reviewer branched from whatever branch was checked out without checking whether
it was current, then reviewed and shipped from it. A deploy from that branch
replaced the running app with an older build and removed `Login`, `SetPassword`
and `VersionBadge`. Nothing caught it, because `scripts/deploy.sh` only refuses
a *dirty* tree — and a branch 59 commits behind `main` is a perfectly clean
tree.

Two durable rules came out of this, and both are now enforced rather than
documented:

1. **Check `main` is an ancestor of `HEAD` before deploying.** Now a hard gate
   in `scripts/deploy.sh`, verified against five scenarios including the
   `DEPLOY_ALLOW_STALE=1` escape hatch for deliberate hotfixes.
2. **No finding enters this document unverified against `main`.** Everything
   below was re-checked against the code, and the fixed items are listed as
   fixed rather than quietly deleted.

The most useful single lesson: **a mock written from the intended interface
hides bugs in that interface.** The `api.put` bug below shipped through a test
file whose mock agreed with the bug. That is now guarded by a test that asserts
the verb surface.

---

## Summary of what is actually true today

Verified against `main` @ `94204ba`. Fixed-in-this-branch items are marked.

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | `api.put` missing → per-exercise notes never persisted | **High** | **Fixed here** |
| 2 | No guard against deploying a branch behind `main` | **High** | **Fixed here** |
| 3 | Invite/reset tokens not superseded on re-mint | Medium | **Fixed here** |
| 4 | Token redemption not atomic (double-redeem race) | Medium | **Fixed here** |
| 5 | `_rate_windows` grows without bound | Medium | **Fixed here** |
| 6 | Toasts have no live region | Medium (a11y) | **Fixed here** |
| 7 | NavBar has no `aria-current` | Low (a11y) | **Fixed here** |
| 8 | `.claude/settings.local.json` untracked but not gitignored | **High** | **Fixed here** |
| 9 | `deploy.sh` `eval`s a gitignored file | Medium | Open |
| 10 | Admin export envelope contains `password_hash` | Medium | Open — **needs a decision** |
| 11 | Container runs as root; no compose limits | Medium | Open |
| 12 | `requirements.txt` installed without `--require-hashes` | Medium | Open |
| 13 | Dockerfile `COPY backend/*.py` by name | Low | Open |
| 14 | AI-agent prompt-injection boundary absent | **High** | Open |

Was reported, **does not apply to `main`**: unauthenticated import (#86 closed
it) · bricked-app recovery (#86) · `/set-password` 404 (the page exists) ·
`/api/health` false-green (health is minimal now; posture moved to
`/api/admin/backup-status`) · service-worker cache staleness (#142/#144 version
the cache and purge on activate *and* on logout) · `DisclosureRow` keyboard
inoperability (now a real `<button>` with `aria-expanded`) · missing
`focus-visible` styles · missing `htmlFor`/`id` in the auth forms.

---

## 1. `api.put` was missing — notes never saved (fixed)

`api.js:68-72` exported `get`, `post`, `patch`, `delete`. `Workout.jsx:384` calls
`api.put('/exercises/${exId}/note', …)` for every per-exercise note save. The
call threw `TypeError: api.put is not a function`, which `saveNote`'s `catch`
converted into a "Failed to save note" toast — while the optimistic
`setNotes` update immediately above it made the note *look* saved. Notes have
never reached the database.

It shipped because `Workout.test.jsx:7-9` mocked the API as exactly
`{ get, post, patch, delete }` — the mock and the bug agreed, and 439 frontend
tests passed over a feature that did not work. `api.test.js` had no assertion
about the verb surface at all.

Fixed: `put` added; `api.test.js` now asserts every verb the backend serves
exists, sends its own HTTP method, and sets `Content-Type` only when it has a
body. Verified by deleting `put` and watching three tests fail — one asserting
`api.put is missing — the backend serves it`, two `it.each` cases failing with
`TypeError: api[verb] is not a function`.

## 2. Nothing stopped a stale-branch deploy (fixed)

Root cause of the 2026-10-03 incident. `scripts/deploy.sh` checked for a dirty
tree and nothing else. Now it refuses when `main` is not an ancestor of `HEAD`,
listing the missing commits, with `DEPLOY_ALLOW_STALE=1` as an explicit
override for deliberate hotfix-from-an-old-branch deploys. There is deliberately
**no** override for the dirty-tree check.

Verified against a scratch repo: on `main` → allowed; feature branch behind
`main` → blocked with the missing commits named; same branch with
`DEPLOY_ALLOW_STALE=1` → allowed; feature branch merged with `main` → allowed;
dirty tree with the override set → still blocked.

## 3–5. Auth hygiene (fixed, each with a regression test)

Three small gaps in code that is otherwise careful:

- **`mint_token` did not supersede prior tokens.** It inserted a row and touched
  nothing else, so "single use" only meant *redeemed once*. A reset link minted
  before a compromise stayed live through the victim's own password reset —
  `set_password` marked only the row it redeemed — and redeeming the stale link
  rotated the password again and logged the attacker in. The email promises
  "this link works once", which has to be true of the *link*. Now outstanding
  tokens of the same kind for that profile are retired first, and only the most
  recent one works. Cross-kind and cross-profile cases are tested, so an invite
  isn't killed by a reset and one account's re-invite doesn't lock another out.
- **Redemption was not atomic.** It `SELECT`ed for `used_at IS NULL` and later
  ran `UPDATE … WHERE id = ?` with no predicate and no rowcount check. Sequential
  reuse was already blocked by the SELECT, so the visible defect needs genuine
  concurrency: two requests both pass the SELECT, both write a password, last
  writer wins. The token is now claimed atomically (`WHERE id = ? AND used_at IS
  NULL` + rowcount check) *before* any hashing, so the loser fails without
  spending a bcrypt.
  Note the first test written for this passed against the *unfixed* code —
  it was sequential and couldn't tell the two implementations apart. The test
  that does distinguish injects the race directly: it consumes the token in the
  window between the SELECT and the write. Old code returns `200` and overwrites
  the password; fixed code returns `400`.
- **`_rate_windows` grew without bound.** Process-global, nothing ever removed a
  key, and the per-subject keys are attacker-chosen (`user:` up to 64 chars,
  `email:` up to 254) on a public endpoint. Now swept past a threshold, with a
  test asserting live windows are never dropped — otherwise the sweep would hand
  an attacker free attempts by ageing their own counter.

## 6–7. Accessibility (fixed)

`Toast` renders every PR announcement and every error in the app; with no live
region all of it was invisible to a screen reader. Now `role="status"` /
`aria-live="polite"`, escalating to `role="alert"` / `assertive` for errors.
`NavBar` conveyed its active tab purely by icon and label colour, so all three
tabs announced as identical links with no position; now `aria-current="page"`.

## 8. Per-machine agent files were not gitignored (fixed)

`.gitignore` covered only `.claude/worktrees/`, so `.claude/settings.local.json`
— containing the deploy target's LAN address, tailnet address, SSH username and
key path — was untracked but not ignored. One `git add -A` published them to a
public repository that had already been scrubbed once to remove them, while
`DECISIONS.md` asserted the file *was* gitignored. Now ignored, with the
reasoning recorded next to the rule so it cannot be quietly reverted.

---

## Open, with notes

**9. `deploy.sh:26-27` `eval`s three lines from `AGENTS.local.md`.** The file is
gitignored, so it is invisible to the script's own dirty-tree gate — the one
mechanical deploy control has a hole. Replacing `eval` with a parser is a
three-line change but touches the deploy path, so it gets its own commit.

**10. Admin export includes `password_hash`.** `main.py:1430` (this branch;
`:1395` on `main`) uses `SELECT *`,
so the export envelope carries every profile's bcrypt hash, and those envelopes
go to Drive. Requires an admin session, which is most of the mitigation. **This
one needs an owner decision rather than a patch**, because stripping the column
changes restore semantics: import deletes and re-inserts `profiles`, so a
restore from a hash-free envelope leaves every account unable to log in and
needing `forgot-password`. That may well be the right trade — a backup should
not carry live credential material — but it changes the disaster-recovery path
and needs a fresh restore drill. Not decided unilaterally.

**11–13. Container and supply chain.** No `USER` in the Dockerfile (runs as
root, which is why two `backup.sh` workarounds exist); no `mem_limit`,
`read_only`, `cap_drop` or `healthcheck` in compose on a documented 1 GB host
sharing with Home Assistant; `requirements.txt` exactly-pinned but installed
without `--require-hashes` and without `--no-deps`, so transitives float; and
`COPY backend/main.py backend/plan_seed.py .` is by-name, which has already
caused one production crash-loop when a third module was missed (#227). These
change the runtime shape and deserve their own deploy and their own rollback
rehearsal.

**14. No prompt-injection boundary in the agentic tooling.** Across
`AGENTS.md`, `PLAYBOOK.md`, `GUARDRAILS.md`, `orchestrate.md`, `STATE.md`,
`DECISIONS.md` and `IMPROVEMENTS.md`, the strings `injection`, `untrusted`,
`as data` and `not instructions` appear **zero times** *(true on `main`, where
this was written — this branch adds an "Untrusted content" section to
`GUARDRAILS.md`, so read the claim as about `main`)* — while
`PLAYBOOK.md:215-219` instructs the orchestrator to read `gh issue view --comments`
on a public repository and *"act on it"*, calling them "**owner** comments"
with no authorship check anywhere. `docs/orchestration/` is not in `CODEOWNERS`
and there is no branch protection, so `GUARDRAILS.md` is rewritable by a PR the
agent self-merges. Text-only to fix, no deploy, and it should not ride along
with a backend security change.

---

## Worth protecting in any refactor

- `acting_profile_id` as the single tenancy seam — every endpoint scopes
  through one dependency, so the 401 is a property of the route signature rather
  than a check each handler must remember.
- Complete parameter binding: every value in `main.py` is a bound `?`, and the
  one request-influenced identifier position (import column lists) is guarded by
  an allowlist derived from `PRAGMA table_info`.
- `TABLE_INTRODUCED_AT` gating, which is what keeps older backups importable as
  tables are added.
- `hash_token`'s plain SHA-256 — correct for 256-bit CSPRNG input, and storing
  only the digest means a leaked backup cannot be replayed into account access.
- `_dummy_hash()`, which makes unknown-username, NULL-hash and wrong-password
  logins cost identically.
- The `AGENTS.md` / `AGENTS.local.md` separation, and
  `scaffold-sanity.yml`'s credential scan over every tracked file.
- The recovery-science constraints, especially the ban on percentages.
- The timer library's absolute-timestamp arithmetic, which is drift-free by
  construction because it never accumulates.