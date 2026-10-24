// Screenshots of every screen for a UX review (docs/ux/REVIEW-CONTRACT.md). A review aid, not a
// test: run it through scripts/ux_capture.sh, which starts both servers on a seeded throwaway DB.
// Writes frontend/ux-shots/<width>/*.png and frontend/ux-shots/INDEX.md (gitignored).
//
// Each shot resizes the viewport to the page height instead of using fullPage, because fullPage
// paints the fixed bottom nav and timer bar halfway down a long page.
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const BASE = process.env.UX_BASE || 'http://localhost:5173'
const USER = process.env.UX_USER || 'kapekost'
const PASS = process.env.UX_PASS || 'correct horse battery'
const OUT = process.env.UX_OUT || 'ux-shots'
const WIDTHS = [390, 320]
const browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH
const executablePath = browsersPath ? path.join(browsersPath, 'chromium') : undefined

const index = []
const browser = await chromium.launch(executablePath ? { executablePath } : {})

for (const width of WIDTHS) {
  const dir = `${OUT}/${width}`
  mkdirSync(dir, { recursive: true })
  const ctx = await browser.newContext({
    viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  })
  const page = await ctx.newPage()
  const shot = async (name, state, { viewportOnly = false } = {}) => {
    await page.waitForTimeout(1200)
    if (!viewportOnly) {
      const h = await page.evaluate(() => document.scrollingElement.scrollHeight)
      await page.setViewportSize({ width, height: Math.min(Math.max(h, 844), 2400) })
      await page.waitForTimeout(400)
    }
    await page.screenshot({ path: `${dir}/${name}.png` })
    await page.setViewportSize({ width, height: 844 })
    index.push(`| ${width} | \`${width}/${name}.png\` | ${state} |`)
  }

  await page.goto(`${BASE}/login`)
  await shot('01-login', 'Login, signed out')
  await page.getByLabel(/username/i).fill(USER)
  await page.locator('#login-password').fill(PASS)
  await page.getByRole('button', { name: /log in/i }).click()
  await page.waitForURL(`${BASE}/`)
  await shot('02-home', 'Home, 8 weeks of history')

  for (const [name, url, state] of [
    ['04-progress', '/progress', 'Progress, first exercise selected'],
    ['05-history', '/history', 'History, all sessions collapsed'],
    ['06-personal-bests', '/personal-bests', 'Personal Bests, none entered'],
    ['07-plan', '/plan', 'Plan, days collapsed'],
    ['08-plan-ai', '/plan/ai', 'Update plan with AI, empty'],
  ]) {
    await page.goto(BASE + url)
    await shot(name, state)
  }

  await page.goto(`${BASE}/`)
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: /^(Start|Resume) / }).first().click()
  await page.waitForURL(/workout/)
  await shot('03a-workout', 'Workout, first exercise open, before any set')
  const logSet = page.getByRole('button', { name: /log set/i }).first()
  if (await logSet.count()) {
    await logSet.click()
    await shot('03b-workout-resting', 'Workout, one set logged, rest timer running (viewport only)', { viewportOnly: true })
  }
  await page.goto(`${BASE}/`)
  await shot('02b-home-in-progress', 'Home with a session in progress')
  await ctx.close()
}

await browser.close()
writeFileSync(`${OUT}/INDEX.md`,
  `# UX screens\n\nCaptured ${new Date().toISOString()}. 2x device scale.\n\n| Width | File | State |\n|---|---|---|\n${index.join('\n')}\n`)
console.log(`${index.length} screens in ${OUT}/`)
