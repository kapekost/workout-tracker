import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import DayAccent from './DayAccent'
import { DAY_COLORS, DAY_COLOR_FALLBACK } from '../data/workoutPlan'

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}

describe('DayAccent', () => {
  it('renders an 8x8 circular dot with the resolved day color by default', () => {
    const { container } = render(<DayAccent day="upper_a" />)
    const el = container.firstChild
    expect(el.style.width).toBe('8px')
    expect(el.style.height).toBe('8px')
    expect(el.style.borderRadius).toBe('50%')
    expect(el.style.background).toBe(hexToRgb(DAY_COLORS.upper_a))
  })

  it('renders an 8x36 bar shape with the resolved day color', () => {
    const { container } = render(<DayAccent day="lower_a" shape="bar" />)
    const el = container.firstChild
    expect(el.style.width).toBe('8px')
    expect(el.style.height).toBe('36px')
    expect(el.style.background).toBe(hexToRgb(DAY_COLORS.lower_a))
  })

  it('falls back to DAY_COLOR_FALLBACK for an unrecognized day', () => {
    const { container } = render(<DayAccent day="bogus_day" />)
    expect(container.firstChild.style.background).toBe(hexToRgb(DAY_COLOR_FALLBACK))
  })

  it('falls back to DAY_COLOR_FALLBACK when no day is given at all', () => {
    const { container } = render(<DayAccent />)
    expect(container.firstChild.style.background).toBe(hexToRgb(DAY_COLOR_FALLBACK))
  })
})
