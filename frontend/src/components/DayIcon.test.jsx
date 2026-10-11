import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import DayIcon from './DayIcon'
import { PLAN, CYCLE, DAY_COLORS, DAY_COLOR_FALLBACK } from '../data/workoutPlan'
import { colors, tint } from '../lib/theme'

let mockPlan = PLAN
vi.mock('../lib/planContext', () => ({ usePlan: () => ({ plan: mockPlan, cycle: CYCLE, ready: true }) }))

const svgFor = (day) => render(<DayIcon day={day} />).container.querySelector('svg')
// The glyph's first group is filled with the day colour; the tone2 path is the only stroke that differs.
const strokes = (svg) => [...svg.querySelectorAll('[stroke]')].map((el) => el.getAttribute('stroke'))

describe('DayIcon', () => {
  it('each of the four days renders a different svg', () => {
    const html = ['upper_a', 'upper_b', 'lower_a', 'lower_b'].map((d) => svgFor(d).innerHTML.replace(/#[0-9a-f]{6}/gi, ''))
    expect(new Set(html).size).toBe(4)
  })
  it('colours the glyph with the day colour and the targeted muscles with a lighter tone', () => {
    const svg = svgFor('lower_a')
    expect(svg.querySelector('circle').getAttribute('fill')).toBe(DAY_COLORS.lower_a)
    expect(strokes(svg)).toContain(tint(DAY_COLORS.lower_a, 0.6))
  })
  it('upper_a second tone is accentDeep', () => {
    expect(strokes(svgFor('upper_a'))).toContain(colors.accentDeep)
  })
  it('an unknown day falls back to the fallback colour and a default glyph', () => {
    const svg = svgFor('bogus_day')
    expect(svg.querySelector('circle').getAttribute('fill')).toBe(DAY_COLOR_FALLBACK)
    expect(svg.innerHTML).toBe(svgFor('upper_a').innerHTML.replaceAll(DAY_COLORS.upper_a, DAY_COLOR_FALLBACK).replaceAll(colors.accentDeep, tint(DAY_COLOR_FALLBACK, 0.6)))
  })
  it('an unrecognised day whose PLAN icon is lower gets the squat', () => {
    mockPlan = { ...PLAN, odd_day: { ...PLAN.upper_a, icon: 'lower' } }
    try {
      const shape = (svg) => svg.innerHTML.replace(/#[0-9a-f]{6}/gi, '')
      expect(shape(svgFor('odd_day'))).toBe(shape(svgFor('lower_a')))
    } finally {
      mockPlan = PLAN
    }
  })
})
