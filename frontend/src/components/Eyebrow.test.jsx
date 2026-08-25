import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Eyebrow from './Eyebrow'
import { colors, type } from '../lib/theme'

// jsdom's CSSOM serializes an inline hex color back out as rgb(...) — see
// Workout.test.jsx's identical helper.
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}

describe('Eyebrow', () => {
  it('renders children as a <p> with the default color/size/tracking/weight', () => {
    render(<Eyebrow>Next up</Eyebrow>)
    const el = screen.getByText('Next up')
    expect(el.tagName).toBe('P')
    expect(el.style.color).toBe(hexToRgb(colors.muted2))
    expect(el.style.fontSize).toBe(type.size.xs)
    expect(el.style.fontWeight).toBe(String(type.weight.bold))
    expect(el.style.textTransform).toBe('uppercase')
    expect(el.style.letterSpacing).toBe(type.labelTracking)
  })

  it('applies explicit color/size overrides instead of silently using the default', () => {
    render(<Eyebrow color={colors.mint} size={type.size.base}>In progress</Eyebrow>)
    const el = screen.getByText('In progress')
    expect(el.style.color).toBe(hexToRgb(colors.mint))
    expect(el.style.fontSize).toBe(type.size.base)
  })

  it('lets an explicit style prop win for a value the API has no dedicated prop for (e.g. weight)', () => {
    render(<Eyebrow style={{ fontWeight: type.weight.semibold, marginBottom: 4 }}>Home</Eyebrow>)
    const el = screen.getByText('Home')
    expect(el.style.fontWeight).toBe(String(type.weight.semibold))
    expect(el.style.marginBottom).toBe('4px')
    // The override doesn't clobber the rest of the base treatment.
    expect(el.style.textTransform).toBe('uppercase')
  })
})
