import { describe, it, expect } from 'vitest'
import { nextIncompleteExerciseId, prefillFor, nextSetNumber } from './workoutFlow'

const exercises = [{ id: 'a', sets: 2 }, { id: 'b', sets: 3 }]

describe('nextIncompleteExerciseId', () => {
  it('returns the first exercise with no sets', () => {
    expect(nextIncompleteExerciseId(exercises, [])).toBe('a')
  })
  it('skips a completed exercise', () => {
    const sets = [{ exercise_id: 'a' }, { exercise_id: 'a' }]
    expect(nextIncompleteExerciseId(exercises, sets)).toBe('b')
  })
  it('returns null when all complete', () => {
    const sets = [{ exercise_id: 'a' }, { exercise_id: 'a' },
                  { exercise_id: 'b' }, { exercise_id: 'b' }, { exercise_id: 'b' }]
    expect(nextIncompleteExerciseId(exercises, sets)).toBeNull()
  })
})

describe('prefillFor', () => {
  it('uses the last set of that exercise this session', () => {
    const sets = [{ exercise_id: 'a', weight_kg: 60, reps: 8 },
                  { exercise_id: 'a', weight_kg: 65, reps: 6 }]
    expect(prefillFor('a', sets)).toEqual({ weight: 65, reps: 6 })
  })
  it('falls back to progress max with 8 reps', () => {
    expect(prefillFor('a', [], { a: 50 })).toEqual({ weight: 50, reps: 8 })
  })
  it('defaults to 20kg x 8 when nothing known', () => {
    expect(prefillFor('a', [], {})).toEqual({ weight: 20, reps: 8 })
  })
})

describe('prefillFor with lastSets', () => {
  it('uses previous workout first set when no this-session sets', () => {
    const last = [{ weight_kg: 75, reps: 10 }, { weight_kg: 80, reps: 8 }]
    expect(prefillFor('a', [], {}, last)).toEqual({ weight: 75, reps: 10 })
  })
  it('prefers this-session last set over lastSets', () => {
    const sets = [{ exercise_id: 'a', weight_kg: 60, reps: 8 }]
    expect(prefillFor('a', sets, {}, [{ weight_kg: 75, reps: 10 }])).toEqual({ weight: 60, reps: 8 })
  })
})

describe('nextSetNumber', () => {
  it('starts at 1 with no sets', () => {
    expect(nextSetNumber([])).toBe(1)
  })
  it('increments past the highest existing number', () => {
    expect(nextSetNumber([{ set_number: 1 }, { set_number: 2 }])).toBe(3)
  })
  it('never reuses a number after a mid-session delete', () => {
    // set #1 of [1,2] was deleted; the next set must be 3, not 2
    expect(nextSetNumber([{ set_number: 2 }])).toBe(3)
  })
})
