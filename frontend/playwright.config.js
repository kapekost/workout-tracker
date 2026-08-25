import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'

// Sandboxed dev environments for this project pre-install Chromium at a fixed
// path (see docs/superpowers/plans/2026-08-25-responsive-ci-guard.md) so a
// local run doesn't trigger a fresh ~150MB browser download on every worktree.
// `chromium` under that path is a stable symlink to the actual binary, so this
// stays valid across whatever revision happens to be installed there.
// A GitHub Actions runner has no such pre-install — it runs its own
// `npx playwright install --with-deps chromium` step (see
// .github/workflows/frontend-tests.yml) and leaves PLAYWRIGHT_BROWSERS_PATH
// unset, so executablePath is left undefined there and Playwright resolves
// the browser it just installed on its own.
const browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH
const executablePath = browsersPath ? path.join(browsersPath, 'chromium') : undefined

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:5173',
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // Starts its own dev server rather than requiring one already running —
  // CI has nothing else listening on :5173. reuseExistingServer lets a
  // local `npm run dev` (e.g. left running from manual testing) short-
  // circuit this instead of erroring on a port collision.
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
})
