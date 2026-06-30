import { describe, it, expect } from 'vitest'
import { findActiveSession } from './activeSession'

describe('findActiveSession', () => {
  it('returns null for empty or non-array input', () => {
    expect(findActiveSession([])).toBeNull()
    expect(findActiveSession(undefined)).toBeNull()
  })

  it('returns null when all sessions are completed', () => {
    expect(findActiveSession([{ id: 1, completed: 1 }, { id: 2, completed: 1 }])).toBeNull()
  })

  it('returns the incomplete session', () => {
    const s = { id: 3, completed: 0 }
    expect(findActiveSession([{ id: 1, completed: 1 }, s])).toBe(s)
  })

  it('returns the most recent incomplete (list is created_at DESC)', () => {
    const recent = { id: 5, completed: 0 }
    const older = { id: 2, completed: 0 }
    expect(findActiveSession([{ id: 6, completed: 1 }, recent, older])).toBe(recent)
  })
})
