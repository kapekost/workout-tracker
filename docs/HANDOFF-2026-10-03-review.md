# Handoff — 2026-10-03, design review + review-CI sessions

Read this before touching the repo. It supersedes the two earlier handoff sections for
anything after the `2b7d923` merge, and it records the reasoning behind decisions that are
easy to undo by accident.

## Where the code is, and what is live

| | |
|---|---|
| Deployed commit | `1f1e390` (from `claude/import-auth-hardening`) |
| Integration branch | `claude/import-auth-hardening` @ `bbef923` — **this is the branch you ship from** |
| `main` | `94204ba`, **165 commits behind** the integration branch |
| Unpushed | `7deefe5` on local branch `ci/review-read-only` (needs a PR) |

`main` is not the integration point and has not been for months. Deploying from `main` would
roll production back to a build that predates auth, and `deploy.sh`'s stale-branch gate will
**not** catch it, because `main` is trivially its own ancestor.

## Merged this session

- **#240** `2b7d923` — Wave 0.4–0.7 and most of Wave 1 from the design review. Six read-failure
  sites that rendered as fact about your own training (the worst, `Workout.jsx`'s
  `.catch(() => nav('/'))`, was not on the original list); Log Set messages that branch on
  `err.status`; a failed note save that keeps your words; the stale indicator with words in it;
  four retired-palette hexes; a type-size allowlist with per-entry reasons; the iOS 16px
  focused-input floor on the note textarea; the toast moved off the header. 20 new tests, each
  confirmed to fail with its fix reverted.
- **#241** `bbef923` — `AGENTS.md` now says `backup.sh` runs on the deploy target.

## Open PR

`ci/review-read-only` → `claude/import-auth-hardening`. Not pushed past `7deefe5`.

### Why it exists, in one paragraph

The review bot (`opencode-review.yml`) is broken in a way that quietly breaks the whole repo:
a job that always exits 1 means no PR is ever green, so "merge on green CI" was not working.
The original cause was mundane — `anomalyco/opencode/github` commits on the runner, which has
no git identity, so it died *after* posting a perfectly good review. Underneath that was a
design problem: that action is a **coding agent**, not a reviewer. `opencode github run`
takes only `--event` and `--token`, and its source pushes whenever the tree is dirty after the
agent runs. As a reviewer it had exactly two possible outcomes — grant `contents: write` so it
can push, or keep `contents: read` and 403.

### The shipped design

opencode is installed and run directly, so no commit/push code path exists. The workflow is
three jobs (see AGENTS.md, "The automated PR reviewer"): `history` fetches prior reviews with a
read-only token, `review` runs the model with `permissions: {}` and reads the history from
`.review-input/` in the workspace, and `post` holds the write token and runs only default-branch
scripts to validate the model's JSON and post it.

## The review failure, and what it taught

Runs 1, 2, 4 and 5 all failed. Run 3 hung 28 minutes in the same step. **Run 6 (#242) finally
produced a review — and it came back BLOCKING with four correct findings against the change
that introduced it.** All four are fixed in `7deefe5`:

1. **Wrong config tier.** The permission block was global config; `opencode run` executes with
   cwd = the PR head, where `opencode.json` is *project* config, which **outranks global**. A
   PR could add `{"permission":{"bash":"allow"}}` to the tracked `opencode.json` and beat the
   entire deny, `chmod -R u+w .` to undo the read-only layer, and `printenv` — with stdout
   posted publicly, so `OPENROUTER_API_KEY` would land in the PR thread. Now the checkout's
   config is *replaced* with a trusted copy that keeps the same `review` block.
2. **`.opencode/plugins/*.js` load in-process before any permission check**, and `.opencode/`
   was not gitignored. No permission block gates plugin code. Now removed before the run, and
   gitignored.
3. **The token-less reviewer killed the re-review path** — `gh` needs a token it no longer
   had, so it could not read its own history or resolve its threads while the prompt said it
   could. Fixed with the two bracketing token steps.
4. **Docs rot.** AGENTS.md, GUARDRAILS.md and DECISIONS.md all promised
   `--request-changes` and "approves in its own name". The bot posts a **comment**; it cannot
   emit a review state at all.

Plus: `set -e` on the review step meant one provider 429 would redden the check *and* skip the
post — the exact failure mode this work exists to stop.

**The transferable lesson:** "deny write, allow bash" is not read-only. The agent used
`printf 'x' > f`. Then `bash: {"*": "deny", "echo*": "allow"}` was also not read-only, because
`echo*` matched the whole string `echo PWNED > pwned.txt`. Both looked correct in the config.
The only thing that held was a default-deny **allowlist**, verified by telling the agent to
actually execute the attempts rather than judging them.

## Owner decisions still open

1. **Toast placement** — done (bottom-anchored, measured at 320px). No action.
2. **1.2 idempotency key** (`client_id` + partial unique index). Needs a **schema change**, so
   its own deploy with an export snapshot and a restore drill. Note this **invalidates** the
   plan document's own closing claim that Wave 1 carries no schema change. An expert pass
   ranked it *below* 1.3/1.6: a duplicate row is cosmetic in History and cheap to delete.
3. **1.4 Finish Workout confirm** — awaiting the mockup pick. The expert's position: an
   un-finish path (`completed: false` already exists in the API, no UI calls it) beats a
   confirm, because finishing is the action you *want* fast.
4. **Dependabot PRs** (5 open) target `main`, so the review bot will not run on them, and they
   will conflict with the 165-commit gap. Either rebase onto the integration branch or let them
   land on `main` as one batch. #237 carries two security advisories in `fast-uri`.
5. **CI runs on `push` to `main` only** — so the branch you actually ship from never gets its
   own test run. PRs are tested; the merge result is not.
6. Unchanged from the earlier review: `password_hash` in export envelopes; the stale
   orchestration home branch.

## Environment facts that cost time this session

- **The reviewer bot cannot run a browser here, but Alpine's own Chromium can.** `apk add
  --no-cache chromium`, then point Playwright at it — `playwright.config.js` already supports
  this via `PLAYWRIGHT_BROWSERS_PATH`:
  ```bash
  mkdir -p /tmp/pwbin && ln -sf /usr/bin/chromium-browser /tmp/pwbin/chromium
  cd frontend && PLAYWRIGHT_BROWSERS_PATH=/tmp/pwbin REVIEW_SHOTS=1 REVIEW_PASS='<pw>' \
    npx playwright test e2e/review-shots.spec.js
  ```
  Playwright's own bundled Chromium **cannot** run: it is a glibc build and this is
  Alpine/musl (`unsupported relocation type 1032` under `gcompat`). Same family as the
  arm64 Dockerfile problem the repo already documents.
- **`review-shots.spec.js` asserts it actually logged in.** App renders *nothing* until
  SessionContext is `ready`, and `session.jsx` allows 5s for that on purpose — the first
  version checked for the login button instantly, silently skipped login, and wrote sixteen
  confident screenshots of the login page while passing.
- **Fail a read by aborting `/api/**`, not `setOffline(true)`.** The service worker is
  production-only, so offline + reload dies on `ERR_INTERNET_DISCONNECTED`. Do not abort
  `/api/auth/**` either, or the app correctly concludes it is logged out and you photograph the
  login page again.
- **Two `test.use()` calls in a loop each apply to the whole describe**, so the second wins and
  every "390px" shot is really 320px. Use one test with `setViewportSize` per width, and raise
  the timeout.
- **`scripts/backup.sh` is a deploy-target script** — it hardcodes
  `$HOME/workout-tracker/docker-compose.yml` and snapshots *inside* the container. Run from your
  laptop it prints "no such file or directory" then "no container to write into", which reads
  like an outage, and it exits non-zero so `a && b && c` silently skips the deploy after it.
- **`/workspace` is a virtiofs mount of the repo** — a shared volume, not a separate copy. But
  the sandbox has **no GitHub credentials**, and anything pasted into chat is redacted before it
  reaches the agent, so the owner has to push. Always run `git branch --show-current` before
  editing: a commit intended for a feature branch once landed on a stale one.

## Not verified

- **No GitHub Actions run has ever gone green** for this workflow. Everything above is
  verified by parsing the YAML, by local permission experiments, and by reading one real bot
  review. The next push of `ci/review-read-only` is the first real test.
- **The `fetch prior review history` step and `Post the verdict` step have never executed.**
  The `gh api --jq` filters in particular are untested against the real API.
- Row counts, and everything behind the login gate, remain unverified since 2026-09-05.
