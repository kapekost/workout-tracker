import { test, expect } from '@playwright/test'

// ---------------------------------------------------------------------------
// Fixtures.
//
// This suite runs against the Vite dev server only — there is no Python
// backend in play here, in local runs or in CI (frontend-tests.yml never
// starts one) — so every /api/* call the app makes is intercepted below.
// Mirrors how Workout.test.jsx mocks the same session shape via
// vi.mock('../api'); this is the same fixture translated from mocking the
// api module directly (Vitest/jsdom) to mocking the network (Playwright/a
// real browser).
// ---------------------------------------------------------------------------

const ACTIVE_SESSION_ID = 1
const WORKOUT_DAY = 'upper_a'
const EXERCISE_ID = 'bench_press' // PLAN.upper_a.exercises[0].id

const sessions = [
  {
    id: ACTIVE_SESSION_ID, workout_day: WORKOUT_DAY, date: '2026-08-20', completed: 0,
    created_at: '2026-08-20 10:00:00', ended_at: null,
  },
  {
    id: 2, workout_day: 'lower_a', date: '2026-08-17', completed: 1,
    created_at: '2026-08-17 09:00:00', ended_at: '2026-08-17 09:52:00',
  },
]

const sessionDetail = { ...sessions[0], sets: [] }

// Non-empty so Progress's exercise-selector chips (R8: sub-44px tap targets
// on this exact element in the original audit) actually render.
const progressExercises = [
  { exercise_id: 'bench_press', exercise_name: 'Bench Press', max_weight: 80 },
  { exercise_id: 'back_squat', exercise_name: 'Back Squat', max_weight: 100 },
]

async function mockApi(page) {
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, '')
    if (path === '/sessions') return route.fulfill({ json: sessions })
    if (path === `/sessions/${ACTIVE_SESSION_ID}`) return route.fulfill({ json: sessionDetail })
    if (path === `/sessions/${ACTIVE_SESSION_ID}/prs`) return route.fulfill({ json: [] })
    if (path === '/notes') return route.fulfill({ json: {} })
    if (path === '/progress') return route.fulfill({ json: progressExercises })
    if (path === '/personal-bests') return route.fulfill({ json: [] })
    if (path === '/exercises/recency') return route.fulfill({ json: [] })
    if (path.startsWith('/exercises/')) return route.fulfill({ json: null }) // /exercises/:id/last
    return route.fulfill({ status: 404, json: { detail: `responsive.spec.js: unmocked ${path}` } })
  })
}

// One active session (id 1, upper_a) throughout: it's what Workout needs to
// render at all (an unresumable session redirects to Home — see Workout.jsx's
// session-fetch .catch), and it doubles as coverage for ResumeBanner's own
// tap targets (R4/R13) on every OTHER page, since the app shows that banner
// whenever a session is active and the current page isn't that session's own
// Workout page.
const PAGES = [
  // Anchored at the start: ResumeBanner's own row button also contains the
  // word "Resume" ("Upper A in progress Resume "), but never starts with it.
  { name: 'Home', path: '/', ready: (page) => page.getByRole('button', { name: /^(Start|Resume)/ }) },
  { name: 'Workout', path: `/workout/${ACTIVE_SESSION_ID}`, ready: (page) => page.getByRole('button', { name: /Finish Workout/i }) },
  { name: 'History', path: '/history', ready: (page) => page.getByRole('heading', { name: 'History', level: 1 }) },
  { name: 'Progress', path: '/progress', ready: (page) => page.getByRole('button', { name: 'Bench Press' }) },
  { name: 'Exercise', path: `/exercise/${WORKOUT_DAY}/${EXERCISE_ID}`, ready: (page) => page.getByRole('heading', { name: 'Bench Press', level: 1 }) },
]

async function gotoReady(page, entry) {
  await mockApi(page)
  await page.goto(entry.path)
  await entry.ready(page).waitFor()
}

// ---------------------------------------------------------------------------
// 320x568 floor: no horizontal overflow (R1-R3) and every tap target >=44px
// tall (R4-R9, R13) — the two blanket checks the 2026-06-30 audit's fixes
// depend on, across the five pages that carry the app's real content.
// ---------------------------------------------------------------------------

test.describe('320x568 floor', () => {
  test.use({ viewport: { width: 320, height: 568 } })

  for (const entry of PAGES) {
    test(`${entry.name}: no horizontal overflow`, async ({ page }) => {
      await gotoReady(page, entry)
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
    })
  }

  for (const entry of PAGES) {
    test(`${entry.name}: tap targets are >=44px tall`, async ({ page }) => {
      await gotoReady(page, entry)
      const targets = page.locator('.tap-target, .btn-icon, nav button')
      const count = await targets.count()
      // A selector that silently matched nothing would make this loop a
      // no-op. Every page here always renders NavBar's 3 items at minimum,
      // so this floor should never trip — if it does, something upstream
      // (routing, the mock fixture) broke, not just this assertion.
      expect(count).toBeGreaterThan(0)
      for (let i = 0; i < count; i++) {
        // .tap-target's own box can be visually smaller than 44px on
        // purpose (index.css:121-131) — the real hit area is an invisible
        // ::after pseudo-element sized max(100%, 44px), added without
        // moving layout. boundingBox() only ever sees the real element, so
        // it can't observe that pseudo-element at all; measure it via
        // computed style instead. Elements without .tap-target (.btn-icon,
        // NavBar's items) have no such pseudo-element — their real box IS
        // the hit area, so boundingBox() is the correct (and only) signal.
        const size = await targets.nth(i).evaluate((el) => {
          if (el.classList.contains('tap-target')) {
            const after = getComputedStyle(el, '::after')
            return { height: parseFloat(after.height), width: parseFloat(after.width) }
          }
          const box = el.getBoundingClientRect()
          return { height: box.height, width: box.width }
        })
        expect(size.height).toBeGreaterThanOrEqual(44)
      }
    })
  }

  test('Workout: weight/reps steppers stay inside the viewport (R2 stepper wrap)', async ({ page }) => {
    await gotoReady(page, PAGES.find(p => p.name === 'Workout'))
    // Workout.jsx's flexWrap/rowGap on the set-logger row (~line 403) lets the
    // Reps stepper drop below Weight instead of clipping off-screen when both
    // can't fit side by side. Scoped to .card so TimerBar's own -30/+30
    // .btn-icon pair (already covered above, and by its own dedicated test
    // below) doesn't get swept into this count.
    const elements = await page.locator('.card .btn-icon, .card input[type="number"]').all()
    expect(elements).toHaveLength(6) // 2 NumControls x (decrease, input, increase)
    for (const el of elements) {
      const box = await el.boundingBox()
      expect(box.x + box.width).toBeLessThanOrEqual(320)
    }
  })
})

// ---------------------------------------------------------------------------
// TimerBar's three breakpoint tiers (index.css ~178-195) actually engage at
// their trigger widths. This is the one thing jsdom fundamentally cannot
// check — it doesn't evaluate @media queries — so only a real browser proves
// it (R1/R10). Checked via computed style rather than a bounding-box
// measurement: .timer-pill's rule is a min-width (content, e.g. "Skip", can
// legitimately render wider than the floor), so the CSS property itself is
// the unambiguous signal that the breakpoint engaged, not the rendered box.
// .btn-icon's rule is a fixed width, so its computed style and its rendered
// box agree either way.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// DisclosureRow's expanded state (component-extraction upgrade): the suite
// above only ever checks pages at their initial, collapsed render. Expanding
// a card renders new content (NumControl steppers on Workout, nothing
// interactive on History) that the collapsed-state checks above never see.
// Chip itself needs no separate coverage here — Progress.jsx's filter chip
// already renders as a `.tap-target` button, so it's already swept into the
// existing "tap targets are >=44px tall" loop on that page.
// ---------------------------------------------------------------------------

test.describe('320x568 floor — DisclosureRow expanded', () => {
  test.use({ viewport: { width: 320, height: 568 } })

  test('Workout: expanding an exercise card stays inside the floor', async ({ page }) => {
    await gotoReady(page, PAGES.find(p => p.name === 'Workout'))
    // Click the .card, not the inner name span: a real tap lands anywhere on
    // the header, and (observed directly) Playwright's mouse-simulated click
    // on the small inline text span doesn't reliably register here, while a
    // click anywhere on the card does — this is also the more realistic
    // target regardless of that quirk.
    await page.locator('.card').filter({ hasText: 'Bench Press' }).first().click()
    await page.getByLabel('increase').first().waitFor() // a NumControl stepper, only rendered once open

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth)

    const targets = await page.locator('.tap-target, .btn-icon, nav button').all()
    for (const el of targets) {
      const size = await el.evaluate((node) => {
        if (node.classList.contains('tap-target')) {
          const after = getComputedStyle(node, '::after')
          return { height: parseFloat(after.height) }
        }
        return { height: node.getBoundingClientRect().height }
      })
      expect(size.height).toBeGreaterThanOrEqual(44)
    }
  })

  test('History: expanding a session card stays inside the floor', async ({ page }) => {
    await gotoReady(page, PAGES.find(p => p.name === 'History'))
    // The completed session's date (2026-08-17) is unique in the fixture;
    // the active session (2026-08-20) doesn't render in History's own list.
    await page.getByText('2026-08-17', { exact: false }).click()

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
  })
})

test.describe('TimerBar breakpoint tiers', () => {
  test('.timer-pill and .timer-bar .btn-icon narrow at <=440px and <=340px', async ({ page }) => {
    await gotoReady(page, PAGES.find(p => p.name === 'Workout'))

    const pill = page.locator('.timer-pill').first()
    const icon = page.locator('.timer-bar .btn-icon').first()

    await page.setViewportSize({ width: 500, height: 800 }) // above both tiers
    await expect(pill).toHaveCSS('min-width', '44px')
    await expect(icon).toHaveCSS('width', '44px')

    await page.setViewportSize({ width: 430, height: 800 }) // <=440, >340
    await expect(pill).toHaveCSS('min-width', '38px')
    await expect(icon).toHaveCSS('width', '38px')

    await page.setViewportSize({ width: 320, height: 800 }) // <=340
    await expect(pill).toHaveCSS('min-width', '34px')
    await expect(icon).toHaveCSS('width', '34px')
  })
})
