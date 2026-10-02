# Plan: `/api/import` auth hardening, and the health check that lies

Date: 2026-10-02
Origin: [`docs/superpowers/research/2026-10-02-full-review.md`](../research/2026-10-02-full-review.md) §1–§4
Status: **plan written, tests proven red, awaiting review before execution**

Scope note: this plan deliberately covers only findings 1–4 of the review. The
remaining findings are sequenced in the "Deliberately out of scope" section at
the end, because bundling a security fix with a refactor makes a deploy hard to
reason about — and this Dockerfile has already caused two live outages from an
over-maintained file list.

---

## Why these four, and why now

`AGENTS.md` records that #86 (flip the login gate) is deliberately blocked
behind #85 so the owner is not locked out. That reasoning is correct. Its
unexamined consequence is that until #86 lands, the app is a single-user app
with **no authentication on any of its 27 data endpoints** — which is fine for a
tailnet — except that one of those 27 is `POST /api/import`, which can delete
every row in the database and write a password hash.

The review proved, against the running app, that an unauthenticated envelope
with `"profiles": []` returns **200** and takes all six tables to zero, after
which every data endpoint 500s and `/api/health` still reports `ok`.

The fix is five lines and does not depend on #85 or #86. It should not wait for
them.

---

## Phase A — Failing tests (TDD gate)

House style: `backend/test_*.py` using the existing `mainmod` / `client` /
`fast_bcrypt` fixtures from `conftest.py`, and `_as_session()` for cookies.
No new fixtures, no new dependencies.

### A1. The import endpoint requires an authenticated admin

```python
def test_import_requires_an_authenticated_admin(client):
    r = client.post("/api/import", json={"mode": "replace", "confirm": True,
        "envelope": {"schema_version": 4, "tables": {}}})
    assert r.status_code == 401
```

**Expected red:** `assert 200 == 401`. This is the test that matters most — it
is the single control whose absence allows findings 2, 3 and 4.

### A2. The exact proof-of-concept envelope cannot wipe the database

Not a "no empty profiles" check — a full behavioural test that seeds data,
attempts the documented exploit, and asserts the data survives.

```python
def test_import_cannot_cascade_wipe_via_an_empty_profiles_table(client, admin):
    _seed_every_table(client)
    before = _row_counts(mainmod)
    r = _as_admin(client).post("/api/import", json={"mode": "replace", "confirm": True,
        "envelope": {"schema_version": 4, "tables": {t: [] for t in
                     ["profiles", "sessions", "sets", "exercise_notes",
                      "events", "personal_bests"]}}})
    assert r.status_code == 400
    assert _row_counts(mainmod) == before, "import must not have destroyed data"
```

**Expected red:** the import returns 200 and every count is 0.

The two-assertion shape matters. Asserting only the status code would let a
future "return 400 but delete first" regression through; asserting only the
counts would let a 200-with-partial-damage regression through.

### A3. An import may not remove the seeded admin

The invariant is about the *seeded profile specifically*, not "at least one
profile" — a restore that keeps a different profile still bricks the app,
because `_default_profile_id` looks up `username = 'kapekost'` by name.

```python
def test_import_refuses_to_remove_the_seeded_admin_profile(client, admin):
    r = _as_admin(client).post("/api/import", json={"mode": "replace", "confirm": True,
        "envelope": {"schema_version": 4, "tables": {"profiles": [
            {"id": 1, "username": "someone-else", "role": "member"}], ...}}})
    assert r.status_code == 400
```

### A4. An import may not write a password hash

This one is the sharpest test in the plan, because it stays meaningful **after**
A1 lands. Once the endpoint is admin-only, an admin can still plant a
credential for any account — including revoking a legitimate user's access by
overwriting their hash with one the admin knows. The invariant is that
`password_hash` is not a column an envelope may ever carry, regardless of who
is calling.

```python
def test_import_refuses_to_write_a_password_hash(client, admin):
    forged = bcrypt.hashpw(b"attacker chosen", bcrypt.gensalt(rounds=4)).decode()
    r = _as_admin(client).post("/api/import", json={... "profiles": [
        {"id": 1, "username": "kapekost", "role": "admin", "password_hash": forged}], ...})
    assert r.status_code == 400
    # And the live row is untouched:
    with mainmod.db() as conn:
        assert conn.execute("SELECT password_hash FROM profiles WHERE username='kapekost'"
                            ).fetchone()[0] != forged
```

### A5. `/api/export` must not hand back the hash

```python
def test_export_omits_password_hash(client):
    for row in client.get("/api/export").json()["tables"]["profiles"]:
        assert "password_hash" not in row
```

**Expected red:** `assert 'password_hash' not in row` fails. Latent today only
because the seeded profile's hash is `NULL`; live the moment a password is set.

### A6. `/api/health` must not report `ok` on a bricked app

The finding the source review missed. `health()` probes with `SELECT 1`
(`main.py:664`), which succeeds on an empty-but-present schema.

```python
def test_health_is_not_ok_when_no_profile_exists(client, mainmod):
    with mainmod.db() as conn:
        conn.execute("DELETE FROM profiles")   # cascades, as the exploit does
        conn.commit()
    body = client.get("/api/health").json()
    assert body["status"] != "ok"
```

**Expected red:** `assert 'ok' != 'ok'`.

### A7. A missing default profile fails clearly

```python
def test_missing_default_profile_raises_a_clear_error(mainmod):
    with mainmod.db() as conn:
        conn.execute("DELETE FROM profiles WHERE username = 'kapekost'")
        conn.commit()
        with pytest.raises(HTTPException) as ei:
            mainmod._default_profile_id(conn)
    assert ei.value.status_code == 500
    assert "kapekost" in str(ei.value.detail)   # names what is missing
```

**Expected red:** `TypeError: 'NoneType' object is not subscriptable` — the
assertion is never reached, which is itself the finding: an operator gets a
`TypeError` from deep inside a helper instead of an actionable message.

### A8. A new token invalidates the previous one

`test_a_token_is_single_use` (`test_invites.py:91`) covers sequential reuse. It
does not cover re-minting, which is the actual gap: a reset token minted before
a compromise survives the victim's own password reset, because `set_password`
only marks the row it redeemed.

```python
def test_minting_a_new_token_invalidates_the_previous_one(fast, mainmod):
    with fast.db() as conn:
        pid = _seed_id(fast)
        first  = fast.mint_token(conn, pid, "reset")
        second = fast.mint_token(conn, pid, "reset")
        conn.commit()
        used = {r[0] for r in conn.execute(
            "SELECT used_at FROM auth_tokens WHERE used_at IS NOT NULL").fetchall()}
    assert fast.hash_token(first) not in ...  # first is now marked used
```

**Expected red:** the first token is still redeemable.

### A9 (frontend). `api.put` exists and issues a PUT

New file `frontend/src/api.test.js` — currently the only module in the frontend
with zero coverage, which is why finding 5 shipped green.

```js
it('exposes put, which the note editor calls', () => {
  expect(typeof api.put).toBe('function')
})
it('put sends a PUT with a JSON body', async () => { /* stub fetch */ })
```

### A10 (frontend). Saving a note actually calls the API

In `Workout.test.jsx`, alongside the existing 13 tests. The `mockSession()`
helper there already throws on unmocked paths, so the assertion is simply that
`api.put` was called with the note path and body.

**Expected red:** `api.put is not a function`.

### Gate

Phase B does not begin until all are red **for the stated reason** — a test that
errors during setup proves nothing. A2 and A7 in particular must fail on their
 assertion or on the `TypeError`, not on a fixture error.

---

## Phase A — proven

Run on Alpine aarch64, Python 3.14.8, Node 24.18.1 — the same libc and
architecture as the deploy target.

| Suite | Baseline | Now | Delta |
|---|---|---|---|
| Backend | 183 passed | 185 passed, **9 failed** | +11 |
| Frontend | 221 passed | 225 passed, **3 failed** | +7 |

### Backend: 9 red, each for the reason it was written

```
unauthenticated import returned 200: {"restored":{"profiles":0,...,"personal_bests":0}}
member import returned 200: {"restored":{"profiles":0,...}}
import returned 200 (cascade wipe payload)
import returned 200 (profiles: [{"username":"someone-else"}])
import returned 200 (forged password_hash accepted)
export leaked ['created_at','email','icon','id','password_hash','role','username']
health reported {'status': 'ok', 'version': 'dev', ...} on an app with no profile
TypeError: 'NoneType' object is not subscriptable   <- main.py:61
the superseded token is still redeemable
```

The last one is the `TypeError` the review predicted, reached before its own
assertion — which is the finding: an operator gets a `TypeError` from three
frames down instead of an actionable message.

Two pass and are meant to: `test_health_is_ok_on_a_healthy_app` and
`test_export_still_carries_the_fields_a_restore_needs`. Both guard the *fix*
against over-correction — B5 must not turn the deploy gate permanently red, and
B8 must not break re-importability, which is the whole point of the export.

### Two tests that had to be repaired before they proved anything

Worth recording, because both would have been easy to mistake for a bad finding:

1. **Three tests errored on missing fixtures.** `fast` and `fast_bcrypt` are
   module-local to `test_auth.py` and `test_invites.py`, not in `conftest.py`.
   They declared their own local copy instead. This is precisely the
   "red for a setup reason" failure the gate exists to catch.
2. **The two frontend component tests could not find any note UI.** The cause
   was neither the collapsed card nor missing data: awaiting `findByRole`
   *inside* `act()` does not poll the way the surrounding tests' pattern does.
   Resolving the element first and then acting on it — the shape every passing
   test in that file already used — fixed it.

### The nuance the component test exposed

`Workout`'s two new note tests **pass immediately**, and it matters why: the
test file's `vi.mock('../api', ...)` supplies `put: vi.fn()`, so
`api.put(...)` resolves regardless of what the real `api.js` exports.

So the component test is a **contract guard**, not proof. It will catch a
future removal of the `api.put` call from `saveNote`, and adding `put` to that
mock removed the second half of the reason the bug shipped green — the mock
shape and the bug agreed with each other. But it **cannot** catch `api.js`
lacking `put`, and it would have stayed green forever otherwise.

The actual proof is `src/api.test.js`, which imports the real module and fails
with `TypeError: api.put is not a function` — the same error the browser
produced, behind a `catch` that turned it into "Failed to save note".

**The generalisable lesson, recorded because it is the most transferable thing
in this plan:** a mocked dependency is only as good as the fidelity of the
mock, and a mock written from the *intended* interface hides bugs in that
interface. `api.js` had no test file at all — the one module whose entire job is
to talk to the real server. The same failure shape would let any half-wired
endpoint ship green.

Phase B therefore has to make **both** green: `api.js` gains `put`, and
`Workout`'s tests keep passing against the mock that now matches reality.

---

## Phase B — The fix

Kept to the minimum that turns Phase A green. No refactors, no renames.

| # | Change | File |
|---|---|---|
| B1 | `def import_data(payload: ImportIn, admin: dict = Depends(require_admin))` | `main.py:1123` |
| B2 | Reject an envelope whose `profiles` rows omit `username='kapekost'` — 400, before any `DELETE` | `main.py:1139` |
| B3 | Reject any envelope row carrying `password_hash` — 400. Allowlist, not denylist | `main.py:1168` |
| B4 | `_default_profile_id`: raise `HTTPException(500, ...)` naming the missing profile | `main.py:61` |
| B5 | `health()`: also assert a profile row exists; `status` becomes `error` | `main.py:663` |
| B6 | `mint_token`: mark the profile's prior unused tokens of the same kind used | `main.py:541` |
| B7 | `set_password`: `UPDATE ... WHERE id = ? AND used_at IS NULL` + `rowcount` check | `main.py:690` |
| B8 | `export_data`: explicit column list for `profiles`, excluding `password_hash` | `main.py:1119` |
| B9 | `api.put` | `frontend/src/api.js` |

**On B2/B3 — validate before mutating.** Both checks belong *before* the
`BEGIN`, not inside the transaction. A validation failure that has already
deleted a table is a worse outcome than one that never started, even with the
rollback in place. The `except Exception → 400` at `main.py:1187` currently
masks `database is locked` as a 400; that is worth a separate look but is not
in scope here.

**On B5 — is a health check a good place for this?** Arguably not: `/api/health`
is a liveness probe and should stay dumb, with the profile check moved to a
readiness concern. But `deploy.sh` verifies against `/api/health` and nothing
else, and adding a second endpoint the deploy script does not read fixes
nothing. The honest version of this change is: make `/api/health` assert the
app can actually serve, and note in its docstring that it is a readiness check
wearing a liveness name. Recorded as a known compromise, not a clean design.

**Explicitly not in Phase B:** module extraction, the `COPY backend/*.py ./`
Dockerfile change, token-in-fragment, the rate-limit threshold split, the
`_rate_windows` eviction, CSP, container hardening. All are in the review; all
deserve their own change.

---

## Phase C — Full local verification

| Step | Command | Pass condition |
|---|---|---|
| C1 | `backend/.venv/bin/python -m pytest -q` | 183 + 10 = **193 passed** |
| C2 | `cd frontend && npm test` | 221 + 3 = **224 passed** |
| C3 | `cd frontend && npx playwright test` | unchanged from baseline |
| C4 | Re-run the review's proof script | the 200-OK wipe must now be 401/400 |
| C5 | `git status` | only intended files staged |

C4 matters more than it looks: the review's proof script is an independent
oracle. It does not import the new tests, so it cannot pass by sharing a bug
with them.

---

## Phase D — Test deployment and rollback

Per `AGENTS.md`'s runbook. **This change touches no schema**, so no pre-deploy
export snapshot and no restore drill are required — but the data-loss blast
radius of the thing being fixed argues for taking one anyway. Cheap.

### D0. Pre-flight, on the build machine

```
git status --porcelain          # must be empty; deploy.sh refuses otherwise
APP_COMMIT=$(git rev-parse --short HEAD)
```

### D1. Snapshot (optional but recommended)

```
curl -s http://<lan-ip>:8080/api/export > pre-deploy-$(date +%F).json
```

### D2. Build and transfer

`bash scripts/deploy.sh` does build → transfer → run → verify in one command.
Run it **unmodified**; if it needs changing to deploy this, that is a finding.

### D3. Verify — and go past what the script checks

`deploy.sh` confirms `/api/health`'s `version` matches the built SHA. That is
necessary and not sufficient. On the deploy target:

```
curl -s http://127.0.0.1:8080/api/health          # status ok, version == APP_COMMIT

# NON-DESTRUCTIVE gate probe -- read this before running anything below.
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:8080/api/import \
     -H 'content-type: application/json' \
     -d '{"mode":"replace","confirm":false,"envelope":{"schema_version":6,"tables":{}}}'
```

**`confirm:false` is not a typo — it is what makes the probe safe.** `require_admin`
is a FastAPI dependency, so it is evaluated *before* the endpoint body, and the
`mode`/`confirm` guard (`main.py:1125`) raises before any envelope validation and
long before the `BEGIN`. So the response cleanly separates the two states with
zero chance of a write:

| Response | Meaning |
|---|---|
| **401** | gate is closed — correct. |
| **400** | gate is **open** — the request reached the body. Stop and roll back. |

Measured on the unfixed app to confirm the discrimination: `confirm:false`
returns `400 {"detail":"import requires mode='replace' and confirm=true"}` with
every row count unchanged.

> **Do not send `confirm:true` as a probe.** An earlier draft of this plan did,
> and it was wrong twice over. Against the unfixed app that exact request returns
> `200` and takes all six tables to zero — measured, not assumed. Worse, the
> probe as first written used an empty `tables` dict, which happens to 400 on the
> unrelated "envelope missing expected tables" check — so it would have reported
> a healthy gate while being unable to tell open from closed. The plan even told
> the reader to treat that 400 as "fix incomplete". A verification step that
> destroys production when the fix is *absent* is worse than no verification
> step, because it is most likely to be run on the one deploy where the fix
> failed. If a destructive check is ever genuinely needed, run it against a
> throwaway copy of the DB file, never the live one.

Then confirm the app still works end to end: start a session, log a set, save a
note (this is finding 5's real test — the note must survive a page reload),
finish the session.

### D4. Row-count sanity

Compare against `/api/health` and a fresh export: 1 profile, the pre-existing
session/set/event counts, and `PRAGMA user_version` still 6. A deploy that
silently changed row counts is exactly the failure this change is about.

### D5. Rollback — rehearsed before it is needed

One step, per `AGENTS.local.md:383`:

```
cd ~/workout-tracker && APP_COMMIT=<previous-good-sha> docker compose up -d
```

Confirm with `docker images kapekost/workout-tracker` that the target tag is
still loaded *before* you need it. `AGENTS.local.md` records that every tag back
through `5247896` is present, and that `1730085` is a known-broken
crash-looping image that must never be deployed.

**Rehearse D5 on this deploy**, do not just document it: roll back, confirm
`/api/health` reports the old SHA, roll forward again. The first rollback
executed during an incident should not also be the first execution of the
command. Note that rolling forward again is a second deploy, so budget for it.

**Rollback is safe here specifically because there is no schema change** — the
old image reads the same v6 database. That is the main reason to keep this fix
free of migrations.

---

## Phase E — Commit and push

**Current state: blocked.** Verified in this session:

```
$ git push --dry-run origin claude/workout-tracker-backlog-bu9qnw
fatal: could not read Username for 'https://github.com': No such device or address
$ git config --get-all credential.helper     # (none)
$ env | grep -c GITHUB_TOKEN                  # 0
$ command -v gh                              # not installed
```

Network to GitHub works — `git ls-remote` returns HEAD — so this is purely
missing credentials. The branch `claude/workout-tracker-backlog-bu9qnw` is in
sync with origin at `714304c`.

Sequence once a credential is available:

1. **Before committing**, add the missing gitignore rules (review finding 7).
   Committing anything while `.claude/settings.local.json` and `opencode.json`
   are untracked-and-unignored risks folding the deploy target's LAN address,
   tailnet address, SSH username and key path into a public repository that was
   already scrubbed once to remove them. This must not be a separate "later".
2. `git add` the intended paths only. Never `git add -A` until (1) is in.
3. Commit with the repo's style — `type(scope): summary`, referencing the issue.
4. Push to a **feature branch**, not `main`. `GUARDRAILS.md:34-47` forbids
   direct pushes to `main`, and there is no branch protection, so nothing
   enforces it but the agent.
5. Open a PR. Never self-merge: `PLAYBOOK.md:363-400` is explicit that the
   agent must not merge its own work, and a self-merge is exactly the mechanism
   the prompt-injection finding in §4 of the review depends on.

---

## Gates blocking execution

| Gate | State | Needed from |
|---|---|---|
| Push credentials | **blocked** — no helper, no token, no `gh` | a token, or run the push yourself |
| `docker` | **absent** from this sandbox | run the deploy from a machine that has it |
| `ssh` + deploy key | **absent**, and no `~/.ssh` at all | the Pi is unreachable from here |
| Review of this plan | pending | you |

The last row is the real one. Phases A and B need nothing but a decision.

---

## Deliberately out of scope

Sequenced for later, each deserving its own change and its own deploy:

1. **`/set-password` + login client** (finding 6). Blocks #86. Should land
   *before* #86, and it is a frontend feature, not a security fix.
2. **Prompt-injection trust boundary** (finding 9). A `GUARDRAILS.md` section,
   author-filtered comment reads, and narrowing `STATE.md:107-111`. Text-only,
   no deploy, and it should not ride along with a backend security change.
3. **`deploy.sh` eval removal** (finding 8). Three lines, no deploy. Separate
   because it touches the deploy path we are about to use.
4. CSP + purging the service worker's `api-reads` bucket (finding 10). Frontend.
5. `api.js` coverage gaps beyond `put`; `Progress`/`Exercise`/`NavBar` untested.
6. Everything in review §5–§7: token atomicity beyond B7, rate-limit thresholds,
   `_rate_windows` eviction, body-size cap, `Referrer-Policy`, container
   hardening, `--require-hashes`, module extraction, the PR single-source-of-
   truth, the `workout_day` Literal.
