import { describe, it, expect } from 'vitest'
import {
  groupRecovery, bandFor, dayLabel, localToday, hoursSince,
  daysBetweenDates, noveltyFor, lastWorkoutLabel, REF_SETS,
} from './recovery'

// A UTC instant we can do exact arithmetic against.
const AT = '2026-08-12 18:00:00'
const AT_MS = Date.parse('2026-08-12T18:00:00Z')
const H = 3600_000

const row = (over = {}) => ({
  exercise_id: 'back_squat', last_date: '2026-08-12', last_at: AT,
  sets: 3, volume_kg: 1000, prev_date: '2026-08-08', ...over,
})

// Lower A quads: back_squat 3 direct + leg_press 3 direct = 6 fractional sets.
const lowerADay = [
  row({ exercise_id: 'back_squat' }),
  row({ exercise_id: 'leg_press' }),
]
const quads = (rows, nowMs) => groupRecovery(rows, nowMs).find(g => g.id === 'quads')

describe('groupRecovery — the quads-after-Lower-A sanity table', () => {
  it('reads Recently trained at 0h', () => {
    const g = quads(lowerADay, AT_MS)
    expect(g.freshness).toBeCloseTo(0, 5)
    expect(g.band).toBe('Recently trained')
  })

  it('reads Partly recovered at 24h', () => {
    const g = quads(lowerADay, AT_MS + 24 * H)
    expect(g.freshness).toBeCloseTo(0.632, 2)
    expect(g.band).toBe('Partly recovered (est.)')
  })

  it('reads Fresh at 48h — Dourado 2023 multi-joint recovery point', () => {
    const g = quads(lowerADay, AT_MS + 48 * H)
    expect(g.freshness).toBeCloseTo(0.865, 2)
    expect(g.band).toBe('Fresh')
  })
})

describe('groupRecovery — novelty', () => {
  const novel = lowerADay.map(r => ({ ...r, prev_date: null }))

  it('applies the 1.5x novelty factor, pushing each band one step later', () => {
    expect(quads(novel, AT_MS + 24 * H).freshness).toBeCloseTo(0.448, 2)
    expect(quads(novel, AT_MS + 24 * H).band).toBe('Partly recovered (est.)')
    expect(quads(novel, AT_MS + 48 * H).freshness).toBeCloseTo(0.797, 2)
    expect(quads(novel, AT_MS + 48 * H).band).toBe('Fresh')
  })
})

describe('noveltyFor', () => {
  it('is 1.5 with no previous session', () => {
    expect(noveltyFor(row({ prev_date: null }))).toBe(1.5)
  })
  it('is 1.5 at exactly 28 days', () => {
    expect(noveltyFor(row({ last_date: '2026-08-12', prev_date: '2026-07-15' }))).toBe(1.5)
  })
  it('is 1.0 at 27 days', () => {
    expect(noveltyFor(row({ last_date: '2026-08-12', prev_date: '2026-07-16' }))).toBe(1.0)
  })
})

describe('load capping', () => {
  it('caps at 1.0 so freshness never goes negative', () => {
    const heavy = [row({ sets: 40 }), row({ exercise_id: 'leg_press', sets: 40 })]
    const g = quads(heavy, AT_MS)
    expect(g.freshness).toBe(0)
  })

  // The min(1, ...) cap applies per exercise bout, before novelty/decay, not to
  // the group's summed load. A single bout whose raw fractional-set term already
  // exceeds 1 (20 sets * 1.0 weight / 6 = 3.33) is the only regime that
  // distinguishes the two orderings — everywhere else in this file the per-bout
  // term stays under 1, so capping per bout vs. capping the sum once would
  // produce identical results and a regression here would go undetected.
  //
  //   correct (cap the bout, then decay): min(1, 3.33) * decay(48h) = 0.1353 -> 0.8647 (Fresh)
  //   wrong   (decay, then cap the sum):        3.33   * decay(48h) = 0.4511 -> 0.5489 (Partly)
  it('caps each bout before decay, not the summed group total', () => {
    const single = [row({ exercise_id: 'back_squat', sets: 20 })]
    const g = quads(single, AT_MS + 48 * H)
    expect(g.freshness).toBeCloseTo(0.8647, 4)
    expect(g.band).toBe('Fresh')
  })
})

describe('bandFor boundaries', () => {
  it('is Fresh at exactly 0.75', () => expect(bandFor(0.75)).toBe('Fresh'))
  it('is Partly recovered just below 0.75', () =>
    expect(bandFor(0.7499)).toBe('Partly recovered (est.)'))
  it('is Partly recovered at exactly 0.35', () =>
    expect(bandFor(0.35)).toBe('Partly recovered (est.)'))
  it('is Recently trained just below 0.35', () =>
    expect(bandFor(0.3499)).toBe('Recently trained'))
  it('is Not trained yet for null', () => expect(bandFor(null)).toBe('Not trained yet'))
})

describe('never-trained groups', () => {
  it('reads Not trained yet, not Fresh', () => {
    const g = groupRecovery([], AT_MS).find(x => x.id === 'chest')
    expect(g.band).toBe('Not trained yet')
    expect(g.daysSince).toBeNull()
    expect(g.hoursSince).toBeNull()
    expect(g.daysSinceLabel).toBe('Not trained yet')
  })

  it('returns one entry per group even with no data', () => {
    expect(groupRecovery([], AT_MS)).toHaveLength(7)
  })
})

describe('indirect contributions count as training', () => {
  it('bench press counts as having trained arms', () => {
    const g = groupRecovery([row({ exercise_id: 'bench_press' })], AT_MS)
      .find(x => x.id === 'arms')
    expect(g.band).not.toBe('Not trained yet')
    expect(g.fractionalSets).toBe(1.5)  // 3 sets x 0.5 indirect
  })
})

describe('time handling', () => {
  it('parses logged_at as UTC, matching History.jsx', () => {
    expect(hoursSince('2026-08-12 18:00:00', Date.parse('2026-08-12T21:00:00Z')))
      .toBeCloseTo(3, 6)
  })

  it('clamps a future timestamp to 0 rather than producing freshness > 1', () => {
    expect(hoursSince(AT, AT_MS - 5 * H)).toBe(0)
    expect(quads(lowerADay, AT_MS - 5 * H).freshness).toBe(0)
  })

  it('counts days by calendar, not by dividing hours', () => {
    // 22:00 local yesterday -> 08:00 local today is 10 hours but one day.
    const yesterday = new Date(2026, 7, 11, 22, 0, 0)
    const today = new Date(2026, 7, 12, 8, 0, 0)
    expect(dayLabel(localToday(yesterday), localToday(today))).toBe('Yesterday')
  })

  it('labels same-day as Today and older gaps in days', () => {
    expect(dayLabel('2026-08-12', '2026-08-12')).toBe('Today')
    expect(dayLabel('2026-08-09', '2026-08-12')).toBe('3 days ago')
  })

  it('computes localToday in the local frame, not UTC', () => {
    expect(localToday(new Date(2026, 7, 12, 0, 30, 0))).toBe('2026-08-12')
  })

  it('measures whole days between ISO dates', () => {
    expect(daysBetweenDates('2026-08-09', '2026-08-12')).toBe(3)
  })
})

describe('lastWorkoutLabel', () => {
  const NOW = new Date(2026, 7, 12, 12).getTime()   // local noon, 2026-08-12
  const on = d => ({ date: d, completed: 1 })

  it('reports the empty state with no sessions', () => {
    expect(lastWorkoutLabel([], NOW)).toBe('No workouts logged yet')
    expect(lastWorkoutLabel(null, NOW)).toBe('No workouts logged yet')
  })

  it('reports the most recent completed session', () => {
    expect(lastWorkoutLabel([on('2026-08-09'), on('2026-08-01')], NOW))
      .toBe('Last workout 3 days ago')
  })

  it('ignores in-progress sessions', () => {
    const sessions = [{ date: '2026-08-12', completed: 0 }, on('2026-08-09')]
    expect(lastWorkoutLabel(sessions, NOW)).toBe('Last workout 3 days ago')
  })

  it('says Today and Yesterday rather than a day count', () => {
    expect(lastWorkoutLabel([on('2026-08-12')], NOW)).toBe('Last workout today')
    expect(lastWorkoutLabel([on('2026-08-11')], NOW)).toBe('Last workout yesterday')
  })
})

describe('exported constants', () => {
  it('uses ref = 6 fractional sets', () => expect(REF_SETS).toBe(6))
})
