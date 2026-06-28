import { describe, it, expect } from 'vitest'
import { getDemoFrames } from './demos'

const demos = {
  bench_press: ['https://cdn.example/bench/0.jpg', 'https://cdn.example/bench/1.jpg'],
  single: ['https://cdn.example/x/0.jpg'],
  empty: [],
}

describe('getDemoFrames', () => {
  it('returns the frame array when present', () => {
    expect(getDemoFrames('bench_press', demos)).toEqual([
      'https://cdn.example/bench/0.jpg',
      'https://cdn.example/bench/1.jpg',
    ])
  })
  it('returns a single-frame array as-is', () => {
    expect(getDemoFrames('single', demos)).toEqual(['https://cdn.example/x/0.jpg'])
  })
  it('returns null when missing or empty', () => {
    expect(getDemoFrames('unknown', demos)).toBeNull()
    expect(getDemoFrames('empty', demos)).toBeNull()
  })
})
