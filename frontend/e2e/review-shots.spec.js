import { test, expect } from '@playwright/test'

// A human review aid, not a test. It asserts nothing: it drives the screens this
// round changed, saves a screenshot of each, and prints the measurements that
// source review cannot make — computed font sizes, contrast-adjacent colours,
// and what is actually on screen at 320px.
//
// Why it exists as a file rather than a note: the 2026-09-06 owner decision is
// that a UI change is not done until the rendered screen has been looked at, and
// four separate reviews have now produced findings that only a browser could
// settle. The authoring session for the 2026-10-03 batch could not run one at all
// (Chromium cannot execute in an Alpine/musl sandbox — `unsupported relocation
// type 1032` under gcompat), so this is the handoff.
//
// Requires a backend on :8000 with a password set — see AGENTS.md, "Running the
// whole app locally". Run it:
//
//   cd frontend
//   REVIEW_SHOTS=1 npx playwright test e2e/review-shots.spec.js
//
// Guarded by REVIEW_SHOTS so `npm run test:e2e` in CI does not try to log in.
// Screenshots land in frontend/review-shots/ (gitignored).

const ON = process.env.REVIEW_SHOTS === '1'
const USER = process.env.REVIEW_USER || 'kapekost'
const PASS = process.env.REVIEW_PASS || ''
const OUT = 'review-shots'

// 320px is the width the responsive audit treats as the floor, and it is where
// every copy change in this batch is most likely to break.
const WIDTHS = [
  { name: '390', width: 390, height: 844 },
  { name: '320', width: 320, height: 568 },
]

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
}

async function login(page) {
  await page.goto('/')
  if (await page.getByRole('button', { name: /log in/i }).count()) {
    await page.fill('input[name="username"], input[type="text"]', USER)
    await page.fill('input[type="password"]', PASS)
    await page.getByRole('button', { name: /log in/i }).click()
    await page.waitForURL('/', { timeout: 15000 })
  }
  await page.waitForTimeout(800)
}

// Every computed value worth eyeballing on one screen, in one dump.
async function measure(page, label) {
  const out = await page.evaluate(() => {
    const one = (sel, props) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const s = getComputedStyle(el)
      return Object.fromEntries(props.map(k => [k, s[k]]))
    }
    const boxes = sel => [...document.querySelectorAll(sel)].map(el => {
      const b = el.getBoundingClientRect()
      return { text: (el.innerText || '').slice(0, 40), top: Math.round(b.top), bottom: Math.round(b.bottom) }
    })
    return {
      viewport: { w: innerWidth, h: innerHeight },
      docScrollWidth: document.documentElement.scrollWidth,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      restLabel: one('.rest-label', ['fontSize', 'letterSpacing']),
      restClock: one('.rest-clock', ['fontSize']),
      wakeChip: one('.wake-chip', ['fontSize']),
      btnIcon: one('.btn-icon', ['backgroundColor', 'fontSize']),
      btnIconDisabled: document.querySelector('.btn-icon')?.disabled
        ? one('.btn-icon', ['opacity', 'cursor'])
        : 'not disabled',
      btnSecondary: one('.btn-secondary', ['color', 'backgroundColor', 'fontSize']),
      toasts: boxes('.toast'),
      headers: boxes('header'),
      alerts: boxes('[role="alert"]'),
      statuses: boxes('[role="status"]'),
    }
  })
  console.log(`\n=== ${label} ===\n` + JSON.stringify(out, null, 1))
  return out
}

test.describe('2026-10-03 review shots', () => {
  test.skip(!ON, 'set REVIEW_SHOTS=1 (needs a local backend with a password set)')

  for (const vp of WIDTHS) {
    test.use({ viewport: { width: vp.width, height: vp.height } })

    test(`screens at ${vp.name}px`, async ({ page }) => {
      await login(page)
      await shot(page, `${vp.name}-01-home`)
      await measure(page, `Home @${vp.name}`)

      // A failed read must not look like an empty account. Offline makes the
      // service worker serve cache or fail; either way this is the screen that
      // used to claim you had no sessions.
      await page.context().setOffline(true)
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(1500)
      await shot(page, `${vp.name}-02-home-offline`)
      await measure(page, `Home offline @${vp.name}`)
      await page.context().setOffline(false)

      for (const [path, slug] of [['/progress', 'progress'], ['/history', 'history'], ['/personal-bests', 'pbs']]) {
        await page.goto(path)
        await page.waitForTimeout(700)
        await shot(page, `${vp.name}-03-${slug}`)
      }

      await page.goto('/')
      await page.waitForTimeout(500)
      const start = page.getByRole('button', { name: /^(Start|Resume) / })
      if (await start.count()) {
        await start.first().click()
        await page.waitForURL(/\/workout\//, { timeout: 15000 })
        await page.waitForTimeout(1200)
        await shot(page, `${vp.name}-04-workout`)
        await measure(page, `Workout @${vp.name}`)

        // The note editor: 16px floor, and whether "· not saved" is visible in a
        // card this dense. Force the failure with the network down.
        const addNote = page.getByRole('button', { name: /add note/i }).first()
        if (await addNote.count()) {
          await addNote.click()
          const ta = page.getByRole('textbox').first()
          await ta.fill('belt popped on set 3')
          await page.context().setOffline(true)
          await ta.blur()
          await page.waitForTimeout(1200)
          await shot(page, `${vp.name}-05-note-failed`)
          await page.context().setOffline(false)
        }
      }
    })
  }
})
