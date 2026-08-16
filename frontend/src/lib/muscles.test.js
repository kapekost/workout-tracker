import { describe, it, expect } from 'vitest'
import { PLAN } from '../data/workoutPlan'
import {
  MUSCLE_GROUPS, ALL_EXERCISES, EXERCISE_BY_ID,
  groupWeightsFor, tauFor, EXERCISE_PATTERN, PATTERN_TAU,
  groupSetsForDay, bestDayForMuscle,
} from './muscles'

const allTagsInPlan = [...new Set(ALL_EXERCISES.flatMap(e => e.muscles))]

describe('taxonomy covers the plan', () => {
  it('has 7 display groups', () => {
    expect(MUSCLE_GROUPS).toHaveLength(7)
  })

  it('maps every raw tag in PLAN to exactly one group', () => {
    const unmapped = allTagsInPlan.filter(
      tag => !MUSCLE_GROUPS.some(g => g.tags.includes(tag)))
    expect(unmapped).toEqual([])

    const doubled = allTagsInPlan.filter(
      tag => MUSCLE_GROUPS.filter(g => g.tags.includes(tag)).length > 1)
    expect(doubled).toEqual([])
  })

  it('has no dead tag entries that never appear in PLAN', () => {
    const dead = MUSCLE_GROUPS.flatMap(g => g.tags)
      .filter(tag => !allTagsInPlan.includes(tag))
    expect(dead).toEqual([])
  })

  it('classifies every exercise in PLAN with a known pattern', () => {
    const missing = ALL_EXERCISES
      .filter(e => !(e.id in EXERCISE_PATTERN))
      .map(e => e.id)
    expect(missing).toEqual([])

    const bad = Object.entries(EXERCISE_PATTERN)
      .filter(([, p]) => !(p in PATTERN_TAU))
      .map(([id]) => id)
    expect(bad).toEqual([])
  })

  it('indexes all 22 exercises', () => {
    expect(ALL_EXERCISES).toHaveLength(22)
    expect(Object.keys(EXERCISE_BY_ID)).toHaveLength(22)
  })
})

describe('groupWeightsFor', () => {
  it('weights the primary muscle 1.0 and the rest 0.5', () => {
    // bench_press: ['Chest', 'Front Delt', 'Triceps']
    expect(groupWeightsFor(EXERCISE_BY_ID.bench_press))
      .toEqual({ chest: 1.0, shoulders: 0.5, arms: 0.5 })
  })

  it('counts an exercise once per group, at its max weight', () => {
    // cable_row: ['Mid Back', 'Rhomboids', 'Lats', 'Biceps'] — first three are
    // all `back`; summing would triple-count one rowing movement.
    expect(groupWeightsFor(EXERCISE_BY_ID.cable_row))
      .toEqual({ back: 1.0, arms: 0.5 })
  })

  it('maps Upper Chest into chest', () => {
    expect(groupWeightsFor(EXERCISE_BY_ID.incline_press).chest).toBe(1.0)
  })

  it('maps both calf heads into calves', () => {
    expect(groupWeightsFor(EXERCISE_BY_ID.standing_calf)).toEqual({ calves: 1.0 })
    expect(groupWeightsFor(EXERCISE_BY_ID.seated_calf)).toEqual({ calves: 1.0 })
  })

  it('gives a single-tag isolation exercise exactly one group at 1.0', () => {
    expect(groupWeightsFor(EXERCISE_BY_ID.lateral_raise)).toEqual({ shoulders: 1.0 })
    expect(groupWeightsFor(EXERCISE_BY_ID.leg_ext)).toEqual({ quads: 1.0 })
  })

  it('lists the genuine primary muscle first for every planned exercise', () => {
    // The positional rule (index 0 → direct) is only valid while this holds.
    const expectedPrimary = {
      bench_press: 'Chest', bent_row: 'Lats', ohp: 'Front Delt',
      lat_pulldown: 'Lats', tricep_pushdown: 'Triceps', db_curl: 'Biceps',
      back_squat: 'Quads', rdl: 'Hamstrings', leg_press: 'Quads',
      leg_curl: 'Hamstrings', standing_calf: 'Gastrocnemius',
      incline_press: 'Upper Chest', pullup: 'Lats', cable_row: 'Mid Back',
      lateral_raise: 'Side Delt', hammer_curl: 'Brachialis',
      skull_crusher: 'Triceps (Long Head)',
      deadlift: 'Hamstrings', bss: 'Quads', hip_thrust: 'Glutes',
      leg_ext: 'Quads', seated_calf: 'Soleus',
    }
    ALL_EXERCISES.forEach(e => {
      expect(e.muscles[0]).toBe(expectedPrimary[e.id])
    })
  })
})

describe('tauFor', () => {
  it('uses 12h for isolation, 18h for multi-joint upper, 24h for multi-joint lower', () => {
    expect(tauFor('db_curl')).toBe(12)
    expect(tauFor('bench_press')).toBe(18)
    expect(tauFor('back_squat')).toBe(24)
  })

  it('falls back to the longest tau for an unclassified exercise', () => {
    // Conservative direction: an unknown exercise reads as MORE recently
    // trained, not less. Our error budget only tolerates overstating freshness.
    expect(tauFor('some_future_exercise')).toBe(24)
  })
})

describe('plan sanity', () => {
  it('still has the 4 expected plan days', () => {
    expect(Object.keys(PLAN)).toEqual(['upper_a', 'lower_a', 'upper_b', 'lower_b'])
  })
})

describe('groupSetsForDay', () => {
  it('counts quads in Lower A as 6 fractional sets', () => {
    // back_squat 3 direct + leg_press 3 direct = 6 — this is the number the
    // recovery model's ref=6 is calibrated against.
    expect(groupSetsForDay('lower_a').quads).toBe(6)
  })

  it('counts chest as 3 in both upper days — the tie bestDayForMuscle must break', () => {
    expect(groupSetsForDay('upper_a').chest).toBe(3)
    expect(groupSetsForDay('upper_b').chest).toBe(3)
  })

  it('accumulates indirect contributions across exercises', () => {
    // Upper A arms: bench .5x3 + bent_row .5x3 + ohp .5x3 + lat_pulldown .5x3
    //             + tricep_pushdown 1x2 + db_curl 1x2 = 10
    expect(groupSetsForDay('upper_a').arms).toBe(10)
  })

  it('returns an empty object for an unknown day', () => {
    expect(groupSetsForDay('bogus_day')).toEqual({})
  })
})

describe('bestDayForMuscle', () => {
  it('picks the day with the most fractional sets', () => {
    expect(bestDayForMuscle('calves')).toBe('lower_a')
  })

  it('breaks the chest tie toward the more rested day', () => {
    expect(bestDayForMuscle('chest', { upper_a: '2026-08-14', upper_b: '2026-08-01' }))
      .toBe('upper_b')
    expect(bestDayForMuscle('chest', { upper_a: '2026-08-01', upper_b: '2026-08-14' }))
      .toBe('upper_a')
  })

  it('treats a never-trained day as infinitely rested', () => {
    expect(bestDayForMuscle('chest', { upper_a: '2026-08-14', upper_b: null }))
      .toBe('upper_b')
  })

  it('falls back to CYCLE order when nothing distinguishes the days', () => {
    expect(bestDayForMuscle('chest', {})).toBe('upper_a')
    expect(bestDayForMuscle('chest', { upper_a: '2026-08-10', upper_b: '2026-08-10' }))
      .toBe('upper_a')
  })

  it('returns a day for every display group', () => {
    MUSCLE_GROUPS.forEach(g => {
      expect(bestDayForMuscle(g.id)).not.toBeNull()
    })
  })

  it('returns null for a group no day trains', () => {
    expect(bestDayForMuscle('not_a_group')).toBeNull()
  })
})
