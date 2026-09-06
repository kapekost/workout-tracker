# PWA API-Cache Versioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tie the `api-reads` service-worker runtime cache's name to the build commit, so a new
deploy's service worker can never serve a `/api/*` GET response an older build cached — closing the
gap where a device that cached real data before a security-relevant deploy (e.g. #86, which added
the login requirement) can keep serving it indefinitely with no login.

**Architecture:** Extract the cache-name computation into its own tiny, pure module
(`frontend/apiCacheName.js`) so it is unit-testable in isolation, without importing the whole
`vite.config.js` module graph (which instantiates the `VitePWA` plugin and shells out to `git` at
import time). Wire that helper into the existing `api-reads` `runtimeCaching` entry in
`vite.config.js`, keyed off the `appCommit` value the file already computes for `__APP_COMMIT__`.
No new dependencies, no service-worker strategy change — this stays on vite-plugin-pwa's
`generateSW` mode (see Task 2's note on why `injectManifest` is deliberately not used).

**Tech Stack:** Vite, vite-plugin-pwa (workbox `generateSW`), Vitest.

**Spec:** Issue #142 (github.com/kapekost/workout-tracker/issues/142) — no separate design doc; the
issue body carries the full scope, rationale, and acceptance criteria this plan implements.

## Global Constraints

- No new dependencies — owner's standing "efficient, not overengineered" constraint.
- Keep vite-plugin-pwa's `generateSW` strategy. Do not switch to `injectManifest` to add
  activate-time cache purging — see Task 2 for why that's a bigger change than this bug warrants.
- `frontend/dist/` is a gitignored build artifact (`.gitignore:6`) — never commit anything under it.
- This fix cannot retroactively help a device already stuck on an old, pre-fix service worker (its
  old SW is still what's running, still pointed at the old unversioned cache). That device needs
  either the owner's manual clear (already requested, separately, as of this issue's filing) or
  #125's forced-update work landing. Record this in the Task 2 issue comment so it isn't mistaken
  for "the phone is fixed now."

---

## Task 1: Extract and test the cache-name helper

**Files:**
- Create: `frontend/apiCacheName.js`
- Test: `frontend/apiCacheName.test.js`

**Interfaces:**
- Produces: `apiReadsCacheName(commit: string): string` — Task 2 imports this by name.

- [ ] **Step 1: Write the failing test**

Create `frontend/apiCacheName.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { apiReadsCacheName } from './apiCacheName.js'

describe('apiReadsCacheName', () => {
  it('embeds the given commit in the cache name', () => {
    expect(apiReadsCacheName('abc1234')).toBe('api-reads-abc1234')
  })

  it('is stable for the same commit', () => {
    expect(apiReadsCacheName('abc1234')).toBe(apiReadsCacheName('abc1234'))
  })

  it('produces a different name for a different commit', () => {
    expect(apiReadsCacheName('abc1234')).not.toBe(apiReadsCacheName('def5678'))
  })

  it('works with the local-dev fallback value too', () => {
    expect(apiReadsCacheName('dev')).toBe('api-reads-dev')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run apiCacheName.test.js`
Expected: FAIL — `Cannot find module './apiCacheName.js'` (or similar resolution error), since the
module doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/apiCacheName.js`:

```js
// The api-reads runtime cache's name is tied to the build commit (see #142):
// a fixed name across deploys let a device that cached real API responses
// before a security-relevant deploy (e.g. #86, which added the login
// requirement) keep serving that stale, pre-auth data indefinitely — only
// individual URLs get overwritten, and only on a live network hit. Scoping
// the cache name by commit means a new deploy always starts from an empty
// cache, so a response can never outlive the build it was fetched under.
export function apiReadsCacheName(commit) {
  return `api-reads-${commit}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run apiCacheName.test.js`
Expected: PASS — all 4 assertions green.

- [ ] **Step 5: Commit**

```bash
git add frontend/apiCacheName.js frontend/apiCacheName.test.js
git commit -m "feat: extract commit-scoped api-reads cache name helper (#142)"
```

---

## Task 2: Wire the helper into `vite.config.js`, verify the built service worker, and record the retroactive-limit note

**Files:**
- Modify: `frontend/vite.config.js`

**Interfaces:**
- Consumes: `apiReadsCacheName(commit: string): string` from Task 1.

**Why no automated test proves the wiring:** `vite.config.js` only takes effect through a real
`vite build`, and this repo's CI never runs one — `.github/workflows/frontend-tests.yml` runs
`npm test` (Vitest, pure JS) and `npm run test:e2e` (Playwright, which starts `npm run dev`, the
*dev* server — `webServer.command` in `frontend/playwright.config.js`). Vite's dev server does not
run vite-plugin-pwa's `generateSW` the way a production build does, so nothing in CI today ever
inspects a real generated `dist/sw.js`. Adding a build step to CI just for this would be a bigger,
separate change (and there's no existing precedent in this repo for a build-output test — every
`frontend/src/lib/*.test.js` tests pure JS in isolation, matching Task 1's approach). So this task's
proof that the helper is actually wired through is a **documented manual verification**, run once as
part of this task, not a new automated check.

- [ ] **Step 1: Import the helper and use it in the `api-reads` cache entry**

In `frontend/vite.config.js`, add the import near the top (after the existing imports):

```js
import { apiReadsCacheName } from './apiCacheName.js'
```

Then change the `api-reads` `runtimeCaching` entry (the one whose comment starts "Offline-read:
last-seen history/progress...") from:

```js
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-reads',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
```

to:

```js
            handler: 'NetworkFirst',
            options: {
              // Commit-scoped so a new deploy can never serve a response an
              // older build cached — see #142 and frontend/apiCacheName.js.
              cacheName: apiReadsCacheName(appCommit),
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
```

- [ ] **Step 2: Manual verification — confirm the built service worker actually uses the versioned name**

Run, from `frontend/`:

```bash
rm -rf dist
APP_COMMIT=testcommit1 npm run build
grep -o "api-reads-[a-zA-Z0-9]*" dist/sw.js
```

Expected output: `api-reads-testcommit1` (and nothing that reads bare `api-reads` — confirm with
`grep -c '"api-reads"' dist/sw.js` printing `0`).

Then rebuild under a different commit and confirm the name changes:

```bash
rm -rf dist
APP_COMMIT=testcommit2 npm run build
grep -o "api-reads-[a-zA-Z0-9]*" dist/sw.js
```

Expected output: `api-reads-testcommit2` — proving each build gets its own cache namespace, so a
service worker built under one commit can never route a request into a cache another commit wrote
to.

Clean up afterward: `rm -rf dist` (it's gitignored, but leaving stray test-commit builds around is
untidy).

- [ ] **Step 3: Run the full frontend unit suite as a safety net**

Run: `cd frontend && npm test`
Expected: PASS, same count as before this change plus Task 1's 4 new assertions. (A repo-wide grep
before this plan was written confirmed nothing outside `vite.config.js` and the gitignored
`dist/sw.js` references the literal string `api-reads`, so no other test should be affected — this
step is the safety net that proves that, rather than assuming it.)

- [ ] **Step 4: Commit**

```bash
git add frontend/vite.config.js
git commit -m "fix: scope api-reads cache name to the build commit (#142)"
```

- [ ] **Step 5: Comment on #142 with the two things a code diff alone wouldn't tell a reader**

Post a comment on issue #142 (via `gh issue comment 142 --body-file -` or equivalent) covering:

1. **What was deliberately not done, and why:** an explicit "purge old-versioned `api-reads` caches
   on `activate`" step was considered (per the issue's own "suggested fix shape") and dropped.
   vite-plugin-pwa's `generateSW` mode (which this project uses, and which this fix keeps) generates
   a complete service worker with no hook point for custom `activate`-event code; adding one would
   mean switching to the `injectManifest` strategy — hand-authoring the service worker's source and
   letting workbox inject only the precache manifest into it. That's a materially larger, riskier
   change than this bug warrants, and conflicts with the owner's standing "efficient, not
   overengineered" constraint. The commit-scoped name alone already delivers the actual required
   security property: a stale entry can never be *served* again, because the new service worker's
   fetch handler only ever opens its own commit's cache, which starts empty. An orphaned
   old-commit cache is inert dead weight, not a live exposure — and it isn't unbounded, either: each
   one still carries its own `maxAgeSeconds: 30 days` / `maxEntries: 100` expiration metadata, and
   the browser's own Cache Storage quota eviction applies at the origin level regardless. Revisit
   only if real storage growth shows up in practice, which is unlikely for a single-user PWA with
   infrequent deploys.
2. **What this fix does not do:** it cannot reach back and fix a device that is already stuck on an
   old, pre-fix service worker — that worker is still the one running on the device, still pointed
   at the old unversioned `api-reads` cache, regardless of what any new deploy contains. The
   already-affected phone needs either the owner's manual clear (uninstall/reinstall the PWA, or
   clear site data — requested separately when this issue was filed) or #125's forced-update
   machinery landing and actually reaching it. Cross-reference #125 in the comment.

---

## Self-Review Notes (for whoever executes this plan)

- **Spec coverage:** #142's two acceptance bullets are Task 2 Step 2 (a cached response can't
  outlive its build — proven by the two-build grep comparison) and this plan's explicit choice not
  to build activate-time purging, justified in Task 2 Step 5's issue comment rather than silently
  dropped.
- **Retroactive limit:** called out in Global Constraints and restated in Task 2 Step 5 so it isn't
  lost — this plan fixes the class of bug, not the specific already-affected phone.
- **No placeholders:** every step above has literal file contents or literal shell commands; nothing
  says "add appropriate tests" or "similar to Task N."
