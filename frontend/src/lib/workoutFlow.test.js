import { describe, it, expect } from 'vitest'
import { nextIncompleteExerciseId, prefillFor } from './workoutFlow'

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
