import { describe, it, expect } from 'vitest'
import { PLAN, ALL_EXERCISES } from './workoutPlan'

describe('ALL_EXERCISES', () => {
  it('has exactly one entry per unique exercise id across all days', () => {
    const idsInPlan = new Set(Object.values(PLAN).flatMap(day => day.exercises.map(e => e.id)))
    expect(ALL_EXERCISES.map(e => e.id).sort()).toEqual([...idsInPlan].sort())
  })

  it('includes exercises from every day, not just the first', () => {
    const ids = ALL_EXERCISES.map(e => e.id)
    expect(ids).toContain('bench_press')  // upper_a
    expect(ids).toContain('back_squat')   // lower_a
    expect(ids).toContain('pullup')       // upper_b
    expect(ids).toContain('deadlift')     // lower_b
  })

  it('is sorted alphabetically by name', () => {
    const names = ALL_EXERCISES.map(e => e.name)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
  })
})
