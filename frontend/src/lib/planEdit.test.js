import { describe, it, expect } from 'vitest'
import { modifyOp, planUpdateBody, rankSwapCandidates } from './planEdit'

const bench = { id: 'bench_press', name: 'Bench Press', sets: 3, repsLow: 6, repsHigh: 10, muscles: ['Chest', 'Front Delt', 'Triceps'] }

describe('modifyOp', () => {
  it('sends only the fields that differ from the plan', () => {
    expect(modifyOp(bench, { sets: 3, repsLow: 6, repsHigh: 8 }))
      .toEqual({ op: 'modify', exercise_id: 'bench_press', reps_high: 8 })
  })

  it('maps the camel-case draft onto the snake-case wire fields', () => {
    expect(modifyOp(bench, { sets: 4, repsLow: 5, repsHigh: 10 }))
      .toEqual({ op: 'modify', exercise_id: 'bench_press', sets: 4, reps_low: 5 })
  })

  it('returns null when nothing changed, so nothing is posted', () => {
    expect(modifyOp(bench, { sets: 3, repsLow: 6, repsHigh: 10 })).toBeNull()
  })
})

describe('planUpdateBody', () => {
  it('wraps the ops for one day in a confirmed plan-update envelope', () => {
    expect(planUpdateBody('upper_a', [{ op: 'remove', exercise_id: 'ohp' }])).toEqual({
      envelope: {
        schema: 'workout-tracker/plan-update/v1',
        summary: 'Edited in the app',
        day_updates: [{ day_key: 'upper_a', exercise_updates: [{ op: 'remove', exercise_id: 'ohp' }] }],
      },
      confirm: true,
    })
  })
})

describe('rankSwapCandidates', () => {
  const plan = {
    upper_a: { exercises: [bench, { id: 'ohp', name: 'Overhead Press', muscles: ['Front Delt', 'Side Delt', 'Triceps'] }] },
    lower_a: { exercises: [{ id: 'leg_press', name: 'Leg Press', muscles: ['Quads', 'Glutes'] }] },
  }
  const entry = (exercise_id, name, muscles) => ({ exercise_id, name, muscles })

  it('ranks by how many muscles the candidate shares with the replaced exercise', () => {
    const catalog = [
      entry('cable_fly', 'Cable Fly', ['Chest', 'Front Delt']),
      entry('db_bench_press', 'Dumbbell Bench Press', ['Chest', 'Front Delt', 'Triceps']),
      entry('goblet_squat', 'Goblet Squat', ['Quads', 'Glutes']),
    ]
    expect(rankSwapCandidates(catalog, plan, bench).map(c => c.exercise_id))
      .toEqual(['db_bench_press', 'cable_fly', 'goblet_squat'])
  })

  it('breaks ties by name', () => {
    const catalog = [
      entry('z_press', 'Zercher Press', ['Chest']),
      entry('a_fly', 'Arm Fly', ['Chest']),
    ]
    expect(rankSwapCandidates(catalog, plan, bench).map(c => c.name))
      .toEqual(['Arm Fly', 'Zercher Press'])
  })

  it('leaves out every exercise already in the plan, on any day', () => {
    const catalog = [
      entry('ohp', 'Overhead Press', ['Front Delt']),
      entry('leg_press', 'Leg Press', ['Quads']),
      entry('db_bench_press', 'Dumbbell Bench Press', ['Chest']),
    ]
    expect(rankSwapCandidates(catalog, plan, bench).map(c => c.exercise_id))
      .toEqual(['db_bench_press'])
  })
})

describe('modifyOp alt_id', () => {
  const ex = { id: 'bench_press', sets: 3, repsLow: 6, repsHigh: 10, altExercise: { id: 'db_bench_press' } }
  it('sends alt_id only when the alternative changed, null to clear it', () => {
    expect(modifyOp(ex, { sets: 3, repsLow: 6, repsHigh: 10, altId: 'db_bench_press' })).toBeNull()
    expect(modifyOp(ex, { sets: 3, repsLow: 6, repsHigh: 10, altId: 'cable_fly' }).alt_id).toBe('cable_fly')
    expect(modifyOp(ex, { sets: 3, repsLow: 6, repsHigh: 10, altId: null }).alt_id).toBeNull()
  })
})
