import { describe, it, expect } from 'vitest'
import { summarize } from './sessionStats'

const sets = [
  { exercise_id: 'bench_press', exercise_name: 'Bench Press', weight_kg: 60, reps: 8 },
  { exercise_id: 'bench_press', exercise_name: 'Bench Press', weight_kg: 65, reps: 6 },
  { exercise_id: 'bent_row', exercise_name: 'Bent-over Row', weight_kg: 50, reps: 10 },
]

describe('summarize', () => {
  it('totals sets and volume', () => {
    const r = summarize(sets, {})
    expect(r.totalSets).toBe(3)
    expect(r.totalVolume).toBe(60*8 + 65*6 + 50*10) // 1370
    expect(r.exerciseCount).toBe(2)
  })
  it('reports PRs only when exceeding prior best', () => {
    const r = summarize(sets, { bench_press: 62, bent_row: 50 })
    // bench best 65 > 62 -> PR; row best 50 not > 50 -> no PR
    expect(r.prs).toEqual([{ name: 'Bench Press', weight: 65 }])
  })
  it('counts first-time lifts as PRs', () => {
    const r = summarize(sets, {})
    expect(r.prs).toContainEqual({ name: 'Bench Press', weight: 65 })
    expect(r.prs).toContainEqual({ name: 'Bent-over Row', weight: 50 })
  })
})
