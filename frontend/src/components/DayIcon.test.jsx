import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import DayIcon from './DayIcon'
import { PLAN, CYCLE, DAY_COLORS, DAY_COLOR_FALLBACK } from '../data/workoutPlan'

vi.mock('../lib/planContext', () => ({ usePlan: () => ({ plan: PLAN, cycle: CYCLE, ready: true }) }))

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
  // #209: the two prior tests only ever asserted the accent-dot color, never
  // the body shape itself -- a future refactor could break upper/lower
  // selection (DayIcon.jsx's `PLAN[day]?.icon === 'lower' ? IconDayLower :
  // IconDayUpper`) while both stayed green. Assert the actual rendered
  // asset differs between an upper and a lower day.
  it('renders a different body shape for an upper day than a lower day', () => {
    const upperSrc = render(<DayIcon day="upper_a" />).container.querySelector('img').getAttribute('src')
    const lowerSrc = render(<DayIcon day="lower_a" />).container.querySelector('img').getAttribute('src')
    expect(upperSrc).toContain('upperbody')
    expect(lowerSrc).toContain('lowerbody')
    expect(upperSrc).not.toBe(lowerSrc)
  })
  it('falls back to DAY_COLOR_FALLBACK for an unrecognized day', () => {
    const { container } = render(<DayIcon day="bogus_day" />)
    expect(container.querySelector('[data-testid="day-icon-dot"]').style.background).toBe(hexToRgb(DAY_COLOR_FALLBACK))
  })
})
