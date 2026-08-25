# Responsive-regression CI guard: implementation plan

**Goal:** Close the gap the inventory's R0 finding names — one manual test, no CI — with a real Playwright suite plus a GitHub Actions workflow, using the pre-installed Chromium for local iteration.

**Spec:** [`../specs/2026-08-25-responsive-ci-guard-design.md`](../specs/2026-08-25-responsive-ci-guard-design.md)

**Depends on:** Upgrade 1 landed. Task 4 below additionally depends on Upgrade 3 landed.

---

### Task 1: Install Playwright, smoke-test the harness

**Files:** Modify `frontend/package.json`, `frontend/package-lock.json`; create `frontend/playwright.config.js`

- [ ] Step 1: `cd frontend && npm install -D @playwright/test`.
- [ ] Step 2: `playwright.config.js`: point `use.baseURL` at `http://localhost:5173` (the existing Vite dev server), configure a single `chromium` project. If a pre-installed browser path is available in the execution environment (check for a `PLAYWRIGHT_BROWSERS_PATH` env var), wire `use.launchOptions.executablePath` to it so local runs don't trigger a fresh download; the CI workflow (Task 3) installs its own browser and doesn't need this.
- [ ] Step 3: Add a `"test:e2e": "playwright test"` script to `package.json`, kept separate from the existing `"test": "vitest run"`.
- [ ] Step 4: Write one throwaway smoke spec (`frontend/e2e/smoke.spec.js`) that just loads `/` and asserts the page title, to prove the harness works end-to-end (dev server + Playwright + whatever browser resolution Step 2 configured) before writing real assertions.
- [ ] Step 5: Run it against a manually-started dev server (`npm run dev` in one process, `npm run test:e2e` in another) — confirm pass. Delete the throwaway spec once confirmed.
- [ ] Step 6: Commit
```bash
git add frontend/package.json frontend/package-lock.json frontend/playwright.config.js
git commit -m "chore(responsive-ci): add Playwright harness"
```

### Task 2: The real assertions — overflow, tap targets, breakpoint tiers

**Files:** Create `frontend/e2e/responsive.spec.js`

- [ ] Step 1: At 320×568 viewport, for each of Home / Workout (needs an active or resumable session — check how `Workout.test.jsx` mocks this, reuse the same fixture approach if the app needs seed data to render the page) / History / Progress / Exercise: navigate, assert `document.documentElement.scrollWidth <= document.documentElement.clientWidth`. Covers the audit's R1-R3 family.
- [ ] Step 2: At the same viewport, assert every element matching `.tap-target`, `.btn-icon`, and NavBar's nav items has `getBoundingClientRect().height >= 44`. Covers R4-R9, R13.
- [ ] Step 3: A dedicated test that starts a workout (or navigates to a page rendering `TimerBar`), resizes the viewport through 440px and 340px, and asserts the specific tier values the audit documents (`index.css:147-169`): `.timer-pill` min-width steps from 44 → 38 → 34, `.btn-icon` width steps the same way. Covers R1/R10.
- [ ] Step 4: A test for the stepper wrap (`Workout.jsx:403`'s `flexWrap`/`rowGap: 14`, the R2 fix): at 320px, assert both `NumControl`s in a set row stay fully within the viewport (no element's `getBoundingClientRect().right > 320`).
- [ ] Step 5: Run `npm run test:e2e` against a locally-started dev server — all pass.
- [ ] Step 6: Commit
```bash
git add frontend/e2e/responsive.spec.js
git commit -m "test(responsive-ci): automate the 44px/320px floor from the 2026-06-30 audit"
```

### Task 3: Wire into GitHub Actions

**Files:** Create `.github/workflows/frontend-tests.yml`

- [ ] Step 1: A workflow triggered on `push` and `pull_request`, running on `ubuntu-latest`: checkout, setup Node (22.14.0, per AGENTS.md, via `actions/setup-node`), `cd frontend && npm ci`, `npm test` (Vitest — fast, runs first so a unit failure fails fast before paying for a browser install), then `npx playwright install --with-deps chromium`, then `npm run test:e2e`.
- [ ] Step 2: Prefer Playwright's own `webServer` config in `playwright.config.js` (`command: 'npm run dev'`, `url: 'http://localhost:5173'`, `reuseExistingServer: !process.env.CI`) over scripting a background dev-server process by hand in the workflow YAML — it's the standard Playwright pattern.
- [ ] Step 3: Push a throwaway commit to confirm the workflow actually runs green on GitHub before considering this task done — a CI config that's never actually executed is unverified, not shipped.
- [ ] Step 4: Commit
```bash
git add .github/workflows/frontend-tests.yml frontend/playwright.config.js
git commit -m "ci(responsive-ci): run Vitest + Playwright responsive suite on push/PR"
```

### Task 4: Extend coverage to Upgrade 3's new components (sequence after Upgrade 3 lands)

**Files:** Modify `frontend/e2e/responsive.spec.js`

- [ ] Step 1: Add the same overflow/tap-target assertions from Task 2 for any new interactive surface Upgrade 3 introduced (`<Chip selected>`, `<DisclosureRow>`'s expanded state) that isn't already covered by an existing page-level test.
- [ ] Step 2: Run, confirm green.
- [ ] Step 3: Commit
```bash
git add frontend/e2e/responsive.spec.js
git commit -m "test(responsive-ci): cover upgrade-3 components at the 320px floor"
```

## Verification (after Tasks 1-3; Task 4 gated on Upgrade 3)
1. `cd frontend && npm test && npm run test:e2e` — both green locally.
2. The GitHub Actions workflow is green on an actual pushed commit, not just locally.
3. `cd backend && .venv/bin/python -m pytest -v` — green, untouched.
4. AGENTS.md updated to name the new guard under Design docs / Status.
