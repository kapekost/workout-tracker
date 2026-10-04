import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import NavBar from './NavBar'
import { colors } from '../lib/theme'

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

// jsdom's CSSOM serializes an inline hex color back out as rgb(...) for a
// style property, but SVG presentation attributes (fill=, stroke=) stay as
// the literal string that was passed -- same split theme.test.js documents.
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}

// #229 Task 3: each nav icon is now a two-tone SVG (Home/History paint via
// `fill` on two <path>s; Progress paints its bars via `fill` and its
// line+arrowhead via `stroke`). No single root attribute carries "the"
// color anymore, so collect every fill/stroke value actually painted.
function iconTones(name) {
  const svg = screen.getByText(name).closest('button').querySelector('svg')
  const tones = new Set()
  for (const el of svg.querySelectorAll('path, rect')) {
    const fill = el.getAttribute('fill')
    const stroke = el.getAttribute('stroke')
    if (fill && fill !== 'none') tones.add(fill)
    if (stroke) tones.add(stroke)
  }
  return tones
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
  it('/personal-bests lights the Progress icon, not Home (a sub-page of Progress)', () => {
    renderAt('/personal-bests')
    expect(iconTones('Progress')).toEqual(new Set([colors.accent, colors.accentDeep]))
    expect(iconTones('Home')).toEqual(new Set([colors.muted, colors.muted3]))
  })

  // #229 sign-off: active tab paints accent + accentDeep; inactive tabs paint
  // muted + muted3. Never opacity-dim a multi-hue asset (the failure mode on
  // record at #211/#213/#228) -- color is the only state signal now.
  it('active tab paints accent and accentDeep', () => {
    renderAt('/')
    expect(iconTones('Home')).toEqual(new Set([colors.accent, colors.accentDeep]))
  })

  it('inactive tabs paint muted and muted3', () => {
    renderAt('/')
    expect(iconTones('Progress')).toEqual(new Set([colors.muted, colors.muted3]))
    expect(iconTones('History')).toEqual(new Set([colors.muted, colors.muted3]))
  })

  it('no nav icon has an opacity attribute or style', () => {
    renderAt('/')
    for (const name of ['Home', 'Progress', 'History']) {
      const svg = screen.getByText(name).closest('button').querySelector('svg')
      expect(svg.hasAttribute('opacity')).toBe(false)
      expect(svg.style.opacity).toBe('')
      for (const el of svg.querySelectorAll('*')) {
        expect(el.hasAttribute('opacity'), `${name}'s ${el.tagName} has an opacity attribute`).toBe(false)
      }
    }
  })
})
