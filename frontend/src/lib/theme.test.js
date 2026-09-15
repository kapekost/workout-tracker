import { describe, it, expect } from 'vitest'
import { colors, type } from './theme'

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
  const n = parseInt(hex.slice(1), 16)
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
