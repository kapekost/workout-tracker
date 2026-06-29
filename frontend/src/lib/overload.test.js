import { describe, it, expect } from 'vitest'
import { overloadSuggestion } from './overload'

describe('overloadSuggestion', () => {
  it('suggests +increment when all sets hit the top rep target', () => {
    expect(overloadSuggestion([{ weight_kg: 80, reps: 8 }, { weight_kg: 80, reps: 8 }], 8))
      .toEqual({ weight: 82.5, hitTarget: true })
  })
  it('repeats weight when not all sets hit target', () => {
    expect(overloadSuggestion([{ weight_kg: 80, reps: 8 }, { weight_kg: 80, reps: 6 }], 8))
      .toEqual({ weight: 80, hitTarget: false })
  })
  it('returns null with no history', () => {
    expect(overloadSuggestion([], 8)).toBeNull()
    expect(overloadSuggestion(null, 8)).toBeNull()
  })
})
