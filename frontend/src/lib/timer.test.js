import { describe, it, expect } from 'vitest'
import { remainingSeconds, elapsedSeconds, formatClock } from './timer'

describe('remainingSeconds', () => {
  it('counts down from the target', () => {
    expect(remainingSeconds(1000, 90, 1000)).toBe(90)
    expect(remainingSeconds(1000, 90, 31000)).toBe(60) // 30s elapsed
  })
  it('clamps to zero (handles throttled gaps)', () => {
    expect(remainingSeconds(1000, 90, 999999)).toBe(0)
  })
})

describe('elapsedSeconds', () => {
  it('counts up and never goes negative', () => {
    expect(elapsedSeconds(1000, 61000)).toBe(60)
    expect(elapsedSeconds(5000, 1000)).toBe(0)
  })
})

describe('formatClock', () => {
  it('formats sub-hour as M:SS', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(75)).toBe('1:15')
  })
  it('formats hour-plus as H:MM:SS', () => {
    expect(formatClock(3661)).toBe('1:01:01')
  })
})
