import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { colors, type, icon, tint } from './theme'

// 2026-09-06 UI review, item 16: the two literal font sizes duplicated
// across 12 call sites (8 at 0.9rem, 4 at 1.1rem) — a deliberately narrow
// addition, not a rationalisation of the type scale's other one-off sizes.
describe('type.size — item 16 of the 2026-09-06 UI review', () => {
  it('adds exactly the two tokens covering the duplicated literal sizes', () => {
    expect(type.size.body).toBe('0.9rem')
    expect(type.size.strong).toBe('1.1rem')
  })
})

// These 10 values must stay byte-identical to index.css's :root custom
// properties (frontend/src/index.css). The two layers serve
// different consumers (see the design-tokens spec, section 1) but must
// never drift apart.
describe('theme colors match index.css :root', () => {
  it('carries over the tier-1 tokens unchanged', () => {
    expect(colors.bg).toBe('#0d0d0d')
    expect(colors.card).toBe('#1a1a1a')
    expect(colors.border).toBe('#2a2a2a')
    expect(colors.accent).toBe('#d4ff3f')
    expect(colors.muted).toBe('#999999')
    expect(colors.muted2).toBe('#b3b3b3')
    expect(colors.text).toBe('#fff')
    expect(colors.danger).toBe('#ef4444')
    expect(colors.success).toBe('#4ade80')
    expect(colors.accentWash).toBe('rgba(212, 255, 63, 0.14)')
  })
})

// WCAG 2.x contrast ratio, measured rather than felt (2026-09-06 UI review,
// item 11). Reimplements the spec's relative-luminance formula directly
// instead of pulling in a contrast-checker dependency for two numbers.
function relativeLuminance(hex) {
  // Expand the 3-digit shorthand first. colors.text is '#fff' and index.css
  // writes '#fff' too, and parseInt('fff', 16) is 0x000fff = rgb(0,15,255) --
  // a blue. Without this, any assertion using shorthand silently measures
  // the wrong colour instead of failing.
  const full = hex.length === 4
    ? '#' + hex.slice(1).split('').map(c => c + c).join('')
    : hex
  const n = parseInt(full.slice(1), 16)
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(c => {
    const cs = c / 255
    return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function contrastRatio(hexA, hexB) {
  const lA = relativeLuminance(hexA)
  const lB = relativeLuminance(hexB)
  const [lighter, darker] = lA > lB ? [lA, lB] : [lB, lA]
  return (lighter + 0.05) / (darker + 0.05)
}

describe('contrast — item 11 of the 2026-09-06 UI review; updated 2026-09-14 for Mono+Volt palette', () => {
  it('the old muted2 (#6b7280) measured under AA — regression guard for the numbers that motivated the fix', () => {
    expect(contrastRatio('#6b7280', '#0a0a12')).toBeCloseTo(4.08, 1)
    expect(contrastRatio('#6b7280', '#111120')).toBeLessThan(4.5)
  })

  it('the old disclosure colour (#4b5563) was nowhere near AA', () => {
    expect(contrastRatio('#4b5563', '#0a0a12')).toBeCloseTo(2.61, 1)
  })

  it('muted2 now clears AA (>=4.5:1) on both new backgrounds (Mono+Volt palette)', () => {
    expect(contrastRatio(colors.muted2, colors.bg)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(colors.muted2, colors.card)).toBeGreaterThanOrEqual(4.5)
  })

  it('the recovery disclosure text (now colors.muted2) clears AA on the new page background', () => {
    // MuscleGroupPicker.jsx's DISCLOSURE paragraph and Home.jsx's VersionStamp
    // both moved off the raw #4b5563 onto this token — this is the one
    // paragraph the recovery research doc insists must always be visible.
    expect(contrastRatio(colors.muted2, colors.bg)).toBeGreaterThanOrEqual(4.5)
  })
})

// ── Wave 0 of docs/superpowers/plans/2026-10-03-design-review-findings.md ──
// The existing parity guard above covers tier-1 colours only, and reads
// neither index.css's non-:root rules nor index.html. These three were
// found by the 2026-10-03 design review and each failed on arrival.

// Vitest runs with cwd at the frontend project root, so these resolve
// against the real stylesheet and the real index.html.
const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')
const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')

// Resolves a CSS custom property's literal from the stylesheet, so a test
// asserts against what the browser actually gets rather than a copy here.
function cssVar(name) {
  const m = css.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{3,8})`))
  if (!m) throw new Error(`no ${name} in index.css`)
  return m[1]
}

// #229 icon design system, signed off 2026-09-30 (see
// docs/superpowers/plans/2026-10-01-icon-design-system-229.md).
describe('icon — #229 role-based scale, signed off 2026-09-30', () => {
  it('has exactly the six roles with the signed-off px values', () => {
    expect(icon).toEqual({
      caption: 16,
      body: 20,
      control: 22,
      heading: 24,
      nav: 26,
      header: 28,
    })
  })

  it('accentDeep and muted3 are the signed-off hex', () => {
    expect(colors.accentDeep).toBe('#8fae22')
    expect(colors.muted3).toBe('#6b6b6b')
  })
})

describe('tint — mixes a hex colour toward white', () => {
  it('tint(hex, 0) returns the input unchanged', () => {
    expect(tint('#8fae22', 0)).toBe('#8fae22')
  })

  it('tint(hex, 1) returns white', () => {
    expect(tint('#8fae22', 1)).toBe('#ffffff')
  })
})

describe('Wave 0 — the error surface is the one that must be readable', () => {
  it('error toast text meets WCAG AA against its fill', () => {
    // The toast is the app's only error surface in the workout loop. At
    // 16px bold the 4.5:1 floor applies (large text needs 18.66px bold),
    // so a red fill under white ink is the highest-stakes contrast pair
    // in the product.
    const rule = css.match(/\.toast\.error\s*{([^}]*)}/)
    expect(rule, '.toast.error rule not found in index.css').toBeTruthy()
    const ink = rule[1].match(/color:\s*(#[0-9a-fA-F]{3,6})/)[1]
    const fill = cssVar(rule[1].match(/background:\s*var\((--[\w-]+)\)/)[1])
    // #fff on the current --danger (#ef4444) measures 3.76:1 — under the
    // 4.5 floor at this size, on the app's only error surface.
    expect(contrastRatio(ink, fill)).toBeGreaterThanOrEqual(4.5)
  })

  it('index.html theme-color matches colors.bg', () => {
    // The first pixel of every PWA launch. It had been left on the retired
    // pre-Mono+Volt dark blue (#0a0a12), a colour that appears nowhere else
    // in the app except as a fixture in the regression test above.
    const m = html.match(/<meta name="theme-color" content="(#[0-9a-fA-F]{3,6})"/)
    expect(m, 'no theme-color meta in index.html').toBeTruthy()
    expect(m[1].toLowerCase()).toBe(colors.bg)
  })

  it('every button class the rest timer uses exposes a disabled state', () => {
    // TimerBar's four controls use .btn-icon / .btn-secondary. Only
    // .btn-primary had a :disabled rule, so Skip looked armed while
    // pointerEvents:none made it inert — with no aria-disabled either.
    for (const cls of ['btn-primary', 'btn-secondary', 'btn-icon']) {
      expect(css, `${cls} has no :disabled rule`).toMatch(
        new RegExp(`\\.${cls}:disabled`)
      )
    }
  })
})
