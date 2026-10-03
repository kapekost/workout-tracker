import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import NavBar from './NavBar'
import { colors } from '../lib/theme'

// jsdom's CSSOM serializes an inline hex color back out as rgb(...) -- see
// Chip.test.jsx's identical helper.
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <NavBar />
    </MemoryRouter>
  )
}

function labelColor(name) {
  return screen.getByText(name).style.color
}

// Home and History are fill-based icons (color lands on the svg's `fill`
// attribute); Progress (IconArrowTrendingUp) is stroke-based (color lands on
// `stroke`) -- same fill/stroke split as IconHome/IconTrophy vs IconCheck.
function iconPaintAttr(name, attr) {
  return screen.getByText(name).closest('button').querySelector('svg').getAttribute(attr)
}

describe('NavBar', () => {
  it('highlights Home, and dims Progress/History, on /', () => {
    renderAt('/')
    expect(labelColor('Home')).toBe(hexToRgb(colors.accent))
    expect(labelColor('Progress')).toBe(hexToRgb(colors.muted))
    expect(labelColor('History')).toBe(hexToRgb(colors.muted))
  })

  it('highlights Progress, not Home, on /progress', () => {
    renderAt('/progress')
    expect(labelColor('Progress')).toBe(hexToRgb(colors.accent))
    expect(labelColor('Home')).toBe(hexToRgb(colors.muted))
  })

  it('highlights History, not Home, on /history', () => {
    renderAt('/history')
    expect(labelColor('History')).toBe(hexToRgb(colors.accent))
    expect(labelColor('Home')).toBe(hexToRgb(colors.muted))
  })

  // The routing bug this file exists to guard: /personal-bests only exists as
  // a drill-down from the Progress tab (its own in-page breadcrumb reads
  // "Progress"), but NavBar's old prefix-match (`tabs.find(t =>
  // pathname.startsWith(t.path))`) matched none of the 3 tab paths here and
  // fell through to the '/' default, lighting up Home instead.
  it('highlights Progress, not Home, on /personal-bests (a sub-page of Progress)', () => {
    renderAt('/personal-bests')
    expect(labelColor('Progress')).toBe(hexToRgb(colors.accent))
    expect(labelColor('Home')).toBe(hexToRgb(colors.muted))
  })

  // The other half of #211/2026-09-27's fix: Progress and History used to be
  // PNG "sticker" icons whose `color` prop was silently dropped (opacity was
  // the only lever that worked on them), so tapping them dimmed/undimmed a
  // fixed-tint raster instead of actually recoloring like Home. Now that
  // they're real SVGs sharing IconHome's color mechanism, both must actually
  // repaint between the active/inactive tokens.
  it('recolors the Progress and History icons themselves (not just their labels) between tabs', () => {
    renderAt('/progress')
    expect(iconPaintAttr('Progress', 'stroke')).toBe(colors.accent)
    expect(iconPaintAttr('History', 'fill')).toBe(colors.muted)
    expect(iconPaintAttr('Home', 'fill')).toBe(colors.muted)
  })
})
