import { describe, it, expect } from 'vitest'
import { getDemoUrl } from './demos'

const demos = { bench_press: 'https://cdn.example/bench.gif' }

describe('getDemoUrl', () => {
  it('returns the url when present', () => {
    expect(getDemoUrl('bench_press', demos)).toBe('https://cdn.example/bench.gif')
  })
  it('returns null when missing or empty', () => {
    expect(getDemoUrl('unknown', demos)).toBeNull()
    expect(getDemoUrl('x', { x: '' })).toBeNull()
  })
})
