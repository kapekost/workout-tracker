import { describe, it, expect, beforeEach } from 'vitest'
import { loadRestTimer, saveRestTimer, clearRestTimer, clearAllRestTimers } from './restTimerStorage'

describe('restTimerStorage', () => {
  beforeEach(() => localStorage.clear())

  it('returns null when nothing is stored for a session', () => {
    expect(loadRestTimer(1)).toBeNull()
  })

  it('round-trips a running timer', () => {
    saveRestTimer(1, { restStartMs: 1000, pausedRem: null })
    expect(loadRestTimer(1)).toEqual({ restStartMs: 1000, pausedRem: null })
  })

  it('round-trips a paused timer', () => {
    saveRestTimer(1, { restStartMs: null, pausedRem: 42 })
    expect(loadRestTimer(1)).toEqual({ restStartMs: null, pausedRem: 42 })
  })

  it('removes the entry once both values go idle, instead of leaving a stale null blob', () => {
    saveRestTimer(1, { restStartMs: 1000, pausedRem: null })
    saveRestTimer(1, { restStartMs: null, pausedRem: null })
    expect(loadRestTimer(1)).toBeNull()
  })

  it('keeps sessions independent by id', () => {
    saveRestTimer(1, { restStartMs: 1000, pausedRem: null })
    saveRestTimer(2, { restStartMs: 2000, pausedRem: null })
    expect(loadRestTimer(1)).toEqual({ restStartMs: 1000, pausedRem: null })
    expect(loadRestTimer(2)).toEqual({ restStartMs: 2000, pausedRem: null })
  })

  it('clearRestTimer removes a stored entry', () => {
    saveRestTimer(1, { restStartMs: 1000, pausedRem: null })
    clearRestTimer(1)
    expect(loadRestTimer(1)).toBeNull()
  })

  it('ignores corrupt JSON instead of throwing', () => {
    localStorage.setItem('restTimer:1', 'not json')
    expect(loadRestTimer(1)).toBeNull()
  })

  describe('clearAllRestTimers', () => {
    it('removes every stored session timer, not just one id', () => {
      saveRestTimer(1, { restStartMs: 1000, pausedRem: null })
      saveRestTimer(2, { restStartMs: null, pausedRem: 42 })
      saveRestTimer(3, { restStartMs: 2000, pausedRem: null })

      clearAllRestTimers()

      expect(loadRestTimer(1)).toBeNull()
      expect(loadRestTimer(2)).toBeNull()
      expect(loadRestTimer(3)).toBeNull()
    })

    it('leaves unrelated localStorage keys alone', () => {
      localStorage.setItem('restPrefSec', '120')
      saveRestTimer(1, { restStartMs: 1000, pausedRem: null })

      clearAllRestTimers()

      expect(localStorage.getItem('restPrefSec')).toBe('120')
    })

    it('does nothing when no timers are stored', () => {
      expect(() => clearAllRestTimers()).not.toThrow()
    })
  })
})
