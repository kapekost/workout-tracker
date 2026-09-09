# Deploy reach + running-version visibility — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Issue:** #125 — the Issue body carries the full scope and acceptance criteria; no separate design
doc. This plan records task ordering, the decisions the Issue left open, and the checks that are
easy to skip.

**Destructive-op gate:** none of GUARDRAILS' triggers apply (no schema/migration, no auth/session/
secret/token handling, no mass file deletion) — nothing for the executor to check or wait on here.

**Goal:** Make the running build visible from any screen without opening `/api/health`, and give a
waiting service-worker update a "tap to reload" affordance instead of the silent, instant reload
that ships today — without touching the mid-workout check-suppression trade-off in `swUpdate.js`,
which is already correct.

**Tech Stack:** Vite, vite-plugin-pwa (workbox `generateSW`), React 19, React Router, Vitest.

## Global Constraints

- **No new dependency.** `useSyncExternalStore` is built into React 19 (already in `package.json`);
  no state library needed for the update-ready flag.
- **Do not touch `shouldCheckForUpdate`'s signature or its own test file's assertions.** It gets a
  second caller in this plan (Task 3), not a rewrite — see Decision 4 below.
- **Do not add a forced reload, a tighter polling interval, or a "remind me later" state machine.**
  The Issue explicitly rules the first two out; the third is scope the "smallest thing that works"
  framing doesn't ask for (see Decision 3).
- **Out of scope:** `backend/main.py` — `/api/health`'s `version` field already exists and is
  correct (confirmed by reading it); nothing here changes the backend. `frontend/src/pages/Home.jsx`
  stays untouched — see Decision 1 for why its existing `VersionStamp` is left alone rather than
  merged into this work.
- Frontend commands run from `frontend/`: `npm test` (Vitest), `npm run build` (needed for Task 2's
  and Task 4's manual verification — CI never runs a real build; see Task 2's note).

## Decisions this plan makes that the Issue left open

1. **The version chip lives in `TopBar.jsx`, not (only) `Home.jsx`.** `TopBar` is the one piece of
   chrome App.jsx's `Shell` renders on every route, including `/login` and `/set-password` (it just
   drops the profile/label content there — the bar itself still renders). That directly closes the
   #105 gap: the owner needs to read the build off the *login* screen, which `Home.jsx`'s existing
   `VersionStamp` (bottom of the Home page, past the empty-state and export link) can never reach,
   since you can't get to Home without a session. `Home.jsx`'s `VersionStamp` is not wrong, just
   insufficient on its own — left in place rather than removed, to keep this diff to the component
   that actually needs to change. Two places printing the commit is mild duplication, not a defect.

2. **Rest state vs. ready state is one row, swapped, not two separate elements.** At rest:
   `v <commit>` (font-mono, `colors.muted2`, `type.size.xs` — same convention `VersionStamp` already
   uses) plus a small icon-only "check" button immediately after it. When the store reports an
   update is ready and it's safe to say so (Decision 4), the whole row swaps to a single tappable
   mint-colored label. Two elements sharing one slot keeps the header's resting footprint as small as
   the Issue asks ("unobtrusive") while still being unambiguous when there's something to act on.

3. **Copy:** the ready-state control reads **"New version — tap to reload"** — the Issue's own
   suggested copy, adopted verbatim rather than reworded, since it already says exactly what happens
   and nothing more. The check control is icon-only (`⟳`, `aria-label="Check for update"`) rather
   than a second line of text, to keep the resting row to one line; tapping it shows a transient
   **"Checking…"** in place of the icon for user feedback, mirroring the existing
   `starting ? 'Starting…' : ...` pattern in `Home.jsx`'s `StartOrResumeButton`. No explicit dismiss
   control on the ready state: "dismissible" is satisfied by the row being non-modal and ignorable —
   nothing blocks the rest of the app while it's showing. A "remind me later" flag would need its own
   state and its own tests for a single-user app that already checks every 30 minutes; not worth it.

4. **The mid-workout gate is `shouldCheckForUpdate`, reused, not duplicated.** The function already
   answers "is now a bad time to interrupt" for the SW *check* in `main.jsx`. The new version-chip
   component calls the same function against its own `useLocation().pathname` to decide whether to
   render the ready-state swap at all: if a "waiting" update lands while a freak race puts one behind
   the workout gate anyway, the badge keeps showing the plain `v <commit>` row until the pathname
   changes, and the swap appears on the next render after that — no reload, no extra flag, and the
   check-run gate and the display gate can never disagree, because they're the same function. Its doc
   comment gets a line added noting the second caller; no behavior or test changes, since
   `swUpdate.test.js`'s existing cases already prove everything both callers rely on. The manual
   "check" control is **not** gated by this function — see Decision 6 for why that's safe.

5. **`vite.config.js`'s `registerType` changes from `'autoUpdate'` to `'prompt'` — this is required,
   not optional.** Traced empirically before writing this plan: built the frontend under the current
   config and `dist/sw.js` contains `self.skipWaiting(),e.clientsClaim()` called unconditionally,
   inline, the moment the generated worker's top-level code runs — there is no "waiting" state to
   prompt from, because vite-plugin-pwa's `'autoUpdate'` registerType (`vite-plugin-pwa/dist/client/
   build/register.js`) never wires `onNeedRefresh` at all; it just reloads on the worker's
   `activated` event. Rebuilt under `'prompt'` and confirmed the opposite: `dist/sw.js` instead
   carries a `message` listener that only calls `self.skipWaiting()` on an explicit
   `{type: "SKIP_WAITING"}` postMessage, and `clientsClaim` disappears from the generated file
   entirely. `'prompt'` is the only registerType that produces a real waiting worker to show a prompt
   for. Side effect worth naming: this also fixes a second, un-asked-for bug — today's `'autoUpdate'`
   reloads *any* screen the instant a check succeeds (the only gate is on when the check *runs*, not
   on whether a found update reloads); after this change nothing reloads without a tap, anywhere.

6. **The manual "check" control is not gated by workout state, only the ready-prompt display is.**
   Checking for an update (`registration.update()`) cannot reload anything post-Decision-5 — the
   worst it can do is flip the store's `ready` flag, which Decision 4's gate then holds back from
   display until the pathname is safe. So the icon-only check control stays live and tappable on
   every screen, including mid-workout; only the resulting "tap to reload" swap is suppressed there.

## Task 1: Extend `swUpdate.js` with a tiny, testable update-ready store

**Files:**
- Modify: `frontend/src/lib/swUpdate.js`
- Modify: `frontend/src/lib/swUpdate.test.js`

**Interfaces:**
- Produces: `createUpdateStore()` (factory) and `updateStore` (the app-wide singleton instance) —
  Task 2 imports `updateStore` into `main.jsx`; Task 3 imports it (as a defaulted prop) into the new
  `VersionBadge` component.
- Store shape: `subscribe(cb) -> unsubscribe`, `getSnapshot() -> boolean`, `markReady()`,
  `setAction(fn)`, `applyUpdate()` (calls the stored action, no args — `registerSW`'s returned
  `updateServiceWorker` already defaults its `reloadPage` param to `true`), `setRegistration(reg)`,
  `checkNow()` (calls `reg.update()` if a registration has been set, else no-ops).
- A **factory**, not a single exported singleton, so each test gets an isolated instance instead of
  needing a reset hook between tests — same reasoning as `2026-09-06-pwa-api-cache-versioning.md`'s
  Task 1 extracting a pure, independently-testable module.

- [ ] **Step 1: Write the failing tests** in `swUpdate.test.js` (new `describe('createUpdateStore')`
      block, alongside the existing `shouldCheckForUpdate` tests — same file, not a new one):
  - `'starts with no update ready'` — `getSnapshot()` is `false` on a fresh store
  - `'markReady flips the snapshot and notifies subscribers'`
  - `'subscribe returns an unsubscribe function that stops further notifications'`
  - `'applyUpdate calls the action set via setAction'`
  - `'applyUpdate is a no-op if no action has been set yet'`
  - `'checkNow calls update() on the registration set via setRegistration'`
  - `'checkNow is a no-op if no registration has been set yet'`
  - `'two createUpdateStore() instances do not share state'`
- [ ] **Step 2:** Run `cd frontend && npx vitest run swUpdate.test.js` — expect FAIL (`createUpdateStore` doesn't exist).
- [ ] **Step 3:** Implement `createUpdateStore()` and `export const updateStore = createUpdateStore()` in `swUpdate.js`, per the shape above. Add a short comment: this is the flag `main.jsx` sets when the SW reports a waiting update (Task 2) and the flag `VersionBadge` reads to decide whether to show the reload prompt (Task 3) — the same pathname gate (`shouldCheckForUpdate`) below decides whether that prompt is allowed to show right now.
- [ ] **Step 4:** Update `shouldCheckForUpdate`'s doc comment to note the second caller (Decision 4) — no signature or behavior change.
- [ ] **Step 5:** Run `cd frontend && npx vitest run swUpdate.test.js` — expect PASS, all assertions including the pre-existing `shouldCheckForUpdate` ones.
- [ ] **Step 6:** Commit: `feat: add an update-ready store to swUpdate.js (#125)`

## Task 2: Switch `registerType` to `'prompt'` and wire `main.jsx` to the store

**Files:**
- Modify: `frontend/vite.config.js` (one line)
- Modify: `frontend/src/main.jsx`

**Interfaces:**
- Consumes: `updateStore`, `shouldCheckForUpdate` from Task 1.
- Produces: a real waiting-worker signal reaching `updateStore.markReady()` in production builds —
  Task 4's manual verification is the only proof of this; nothing in CI builds the Dockerfile or
  runs a production `vite build` (same gap `2026-09-06-pwa-api-cache-versioning.md`'s Task 2 already
  documented for this exact file).

- [ ] **Step 1:** In `vite.config.js`, change `registerType: 'autoUpdate'` to `registerType: 'prompt'`. Update the adjacent comment (currently explains the old `autoUpdate` + `shouldCheckForUpdate` interaction) to reflect Decision 5's reasoning.
- [ ] **Step 2:** In `main.jsx`, wire the three touchpoints into `registerSW`'s options and capture its return value:
  - `onNeedRefresh()` calls `updateStore.markReady()`.
  - `onRegisteredSW(_swUrl, registration)` additionally calls `updateStore.setRegistration(registration)` before its existing `check`/`visibilitychange`/`setInterval` wiring (unchanged).
  - Capture `registerSW(...)`'s return value (currently discarded) into a local, and call `updateStore.setAction(...)` with it once, after the call.
- [ ] **Step 3: Manual verification — confirm the built worker actually waits instead of auto-activating.** From `frontend/`:
  ```
  rm -rf dist && npm run build
  grep -c "self.skipWaiting()" dist/sw.js   # expect 0 — no more unconditional skip-waiting
  grep -c "SKIP_WAITING" dist/sw.js         # expect >=1 — message-gated skip-waiting instead
  grep -c "clientsClaim" dist/sw.js         # expect 0 — no more auto-claiming clients on install
  rm -rf dist
  ```
  (Verified empirically while writing this plan: the current `'autoUpdate'` config produces the
  opposite of all three counts. If any of these don't match after Step 1, `registerType` didn't take
  — stop and check for a stale `node_modules/.vite` cache before touching anything else.)
- [ ] **Step 4:** Run `cd frontend && npm test` — expect the same pass count as before this task, plus Task 1's new assertions. Nothing here should touch existing coverage; `main.jsx` has no test file (it never has — it's entry-point glue) and this task keeps it that way by pushing all the testable logic into `swUpdate.js`.
- [ ] **Step 5:** Commit: `fix: hold a found update as waiting instead of auto-reloading (#125)`

## Task 3: `VersionBadge` component, mounted in `TopBar`

**Files:**
- Create: `frontend/src/components/VersionBadge.jsx`
- Create: `frontend/src/components/VersionBadge.test.jsx`
- Modify: `frontend/src/components/TopBar.jsx`
- Modify: `frontend/src/components/TopBar.test.jsx`

**Interfaces:**
- Consumes: `updateStore`, `shouldCheckForUpdate` from Task 1/2; `__APP_COMMIT__` (already a global, see `vite.config.js`'s `define`).
- `VersionBadge` accepts an optional `store` prop, defaulting to the real `updateStore` singleton —
  the seam Task's own tests use to inject an isolated store instead of touching module state.

- [ ] **Step 1: Write the failing tests** in `VersionBadge.test.jsx` (pattern after `ResumeBanner.test.jsx`: a `renderBadge(store, path)` helper wrapping `MemoryRouter`, and a fake store object per case built from `createUpdateStore()` or a hand-rolled `{subscribe, getSnapshot, markReady, checkNow, applyUpdate}` stub):
  - `'shows the running build's commit at rest'` — matches `/^v \S+$/`, same assertion `Home.test.jsx`'s `VersionStamp` test already uses
  - `'renders a check-for-update control at rest'` — a button with `aria-label: 'Check for update'`
  - `'tapping check calls the store's checkNow'`
  - `'shows a transient "Checking…" state after tapping check'`
  - `'swaps to the update-ready prompt once the store reports ready'` — text `'New version — tap to reload'` present, check control gone
  - `'tapping the ready prompt calls the store's applyUpdate'`
  - `'suppresses the ready prompt while a workout is in progress'` — store reporting ready, rendered at `/workout/9`, still shows the plain `v <commit>` row
  - `'shows the ready prompt again once off the workout screen'` — same ready store, rendered at `/progress`
- [ ] **Step 2:** Run `cd frontend && npx vitest run VersionBadge.test.jsx` — expect FAIL (module doesn't exist).
- [ ] **Step 3: Implement `VersionBadge.jsx`.** `useSyncExternalStore(store.subscribe, store.getSnapshot)` for the ready flag; `useLocation()` for the pathname; local `useState` for the transient checking label (mirrors `Home.jsx`'s `starting` pattern — no timer cleanup complexity beyond what that pattern already has). Render: if `ready && shouldCheckForUpdate(pathname)`, the mint tappable prompt (`type.size.sm`, `type.weight.semibold`, `colors.mint`, `className="tap-target"`); otherwise the resting row (`font-mono`, `colors.muted2`, `type.size.xs` version text + icon-only check button, `className="tap-target"` on the button per this app's existing icon-button convention).
- [ ] **Step 4:** Run tests — expect PASS.
- [ ] **Step 5: Mount it in `TopBar.jsx`.** Wrap the existing `🏋 Gym Tracker` `<span>` in a `<div style={{display: 'flex', flexDirection: 'column', flexShrink: 0, minWidth: 0}}>` alongside a new `<VersionBadge />` directly below it — outside the `authScreen ? ... : ...` branch, so it renders on `/login` and `/set-password` too (that's the whole point per Decision 1). Do not change the title `<span>`'s own inline styles — `TopBar.test.jsx`'s existing `toHaveStyle({whiteSpace: 'nowrap', flexShrink: '0'})` assertion depends on them staying exactly as they are.
- [ ] **Step 6:** Add to `TopBar.test.jsx`: two thin integration assertions (not a re-test of `VersionBadge`'s own behavior) — `'renders the version badge on the ordinary app screens'` (path `/`) and `'renders the version badge on the login screen too'` (path `/login`), each just checking the `v \S+` text is present.
- [ ] **Step 7:** Run `cd frontend && npm test` — full suite green.
- [ ] **Step 8:** Commit: `feat: show the running build and a tap-to-reload prompt in TopBar (#125)`

## Task 4: Render it for real, screenshot, and UI/UX review

This is a UI-touching change — per this repo's standing rule, code review and green tests are not
enough on their own; three real UI defects shipped through both on 2026-09-05 and were obvious in
the first screenshot.

**Part A — the real end-to-end SW flow (no login needed, proves Task 2's `registerType` change):**
- [ ] From `frontend/`: `rm -rf dist && APP_COMMIT=planv1 npm run build && npx vite preview --port 4173`
- [ ] Open `http://localhost:4173/login` in a real browser. Confirm in devtools (Application → Service Workers) that a worker activates. **Screenshot the resting state** — should read `v planv1` plus the check icon.
- [ ] In another terminal, rebuild in place: `rm -rf dist && APP_COMMIT=planv2 npm run build` (`vite preview` keeps serving the same `dist/` directory it already opened).
- [ ] In the running tab, tap the check (`⟳`) control. **Screenshot the ready state** once it swaps to "New version — tap to reload" (should appear within a few seconds — this is a real `registration.update()` finding a real byte-different `sw.js`).
- [ ] Tap the prompt. Confirm the page reloads and now reads `v planv2` — the full round trip the Issue's acceptance criteria describe. **Screenshot the post-reload state.**
- [ ] Stop the preview server; `rm -rf dist`.

**Part B — mid-workout suppression (needs a real session; proves Task 3's pathname gate):**
- [ ] `cd backend && DATABASE_URL=/tmp/dev-workouts-125.db .venv/bin/uvicorn main:app --reload` (per `AGENTS.md`'s local-dev section; bootstrap a login with `scripts/bootstrap_owner.py` against that same `DATABASE_URL` if the fresh DB has no password set).
- [ ] `cd frontend && npm run dev`, log in, start a workout, land on `/workout/<id>`.
- [ ] In devtools console: `const {updateStore} = await import('/src/lib/swUpdate.js'); updateStore.markReady()` (the dev server doesn't register a real SW — `devOptions` isn't enabled — so this exercises the same store directly; Part A already proved the real SW plumbing).
- [ ] **Screenshot:** the badge still reads plain `v <commit>` on `/workout/<id>` — the update is queued, not shown.
- [ ] Navigate off the workout screen (e.g. Home). **Screenshot:** the badge now shows "New version — tap to reload" — queued, then surfaced, exactly per the Issue's acceptance criteria.

**UI/UX review of the screenshots (efficient, not overengineered — reuse existing tokens, no new component library):**
- [ ] Hierarchy: does the badge read as secondary chrome under the title, not compete with it or with the profile/log-out controls on the right?
- [ ] Spacing/tap targets: is the `⟳` control comfortably tappable at real phone width (375px), not cramped against the title above it?
- [ ] Copy: does "New version — tap to reload" read clearly at `type.size.sm` against the header's background in both the resting and ready states?
- [ ] One-handed phone use: the badge sits top-left, same reach as the existing "Log out"/"Log in" control on the right — no worse than chrome this bar already carries.
- [ ] Color: confirm `colors.mint` on `colors.bg` reads clearly for the ready state (this pairing is already used for `Eyebrow` and the active `NavBar` tab elsewhere in the app, so no new contrast question — just confirm the screenshot looks the same).
- [ ] Record findings inline in the PR description; fix anything real before requesting review, rather than filing a follow-up.

## Review, PR and deploy

- [ ] `superpowers:requesting-code-review` (spec conformance + code quality). No `/security-review` — this touches no auth/session/secret/token/migration path.
- [ ] PR with `Closes #125`. `gh pr checks <PR> --watch --fail-fast`, then confirm `gh pr view <PR> --json headRefOid,statusCheckRollup` shows the commit just pushed (a rollup read immediately after a push can be stale), then `gh pr merge <PR> --squash --delete-branch`. Never `--auto`.
- [ ] Deploy and verify on a real device per this repo's "complete means deployed" convention: after `scripts/deploy.sh`, open the app on the owner's actual phone (the one that missed #105) and confirm the version chip reads the new commit without a manual cache-clear — this is the concrete, hands-on version of the acceptance criteria the earlier support loop never got.

## Issue coverage

"No signal" → Task 3 (badge visible on every screen, including `/login`). "No way to force it" →
Task 3's check control + Decision 6 (safe on every screen, including mid-workout). "Silent staleness
already caused a support loop" (#105) → Decision 1 (the badge reaches the login screen specifically)
and Task 4's Part A/B screenshots, which reproduce and then disprove that exact failure mode.
Acceptance bullet 1 (update surfaces within the existing interval, no reload that loses input) →
Task 2 (registerType) + Task 4 Part A (real round trip) + Task 4 Part B (queued during a workout,
surfaced after). Acceptance bullet 2 (owner can answer "which version" from the UI) → Task 3.
