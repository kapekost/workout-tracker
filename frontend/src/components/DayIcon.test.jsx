import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import DayIcon from './DayIcon'
import { DAY_COLORS, DAY_COLOR_FALLBACK } from '../data/workoutPlan'

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}

describe('DayIcon', () => {
  it('renders one body icon with an accent dot in the resolved day color', () => {
    const { container } = render(<DayIcon day="upper_a" />)
    // Day-type bodies are PNG-backed (#211: a same-color opacity accent is
    // invisible on a plain SVG glyph), so this is an img, not an svg.
    expect(container.querySelectorAll('img').length).toBe(1)
    expect(container.querySelector('[data-testid="day-icon-dot"]').style.background).toBe(hexToRgb(DAY_COLORS.upper_a))
  })
  it('renders the lower-body shape for a lower day', () => {
    const { container } = render(<DayIcon day="lower_b" />)
    expect(container.querySelector('[data-testid="day-icon-dot"]').style.background).toBe(hexToRgb(DAY_COLORS.lower_b))
  })
  it('falls back to DAY_COLOR_FALLBACK for an unrecognized day', () => {
    const { container } = render(<DayIcon day="bogus_day" />)
    expect(container.querySelector('[data-testid="day-icon-dot"]').style.background).toBe(hexToRgb(DAY_COLOR_FALLBACK))
  })
})
