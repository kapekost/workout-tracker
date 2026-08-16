// Estimated stimulus decay per muscle group, from training logs alone.
//
// This is an ESTIMATE and the UI must always say so. We have elapsed time and
// logged volume; we do not have HRV, sleep, soreness, or anything else the
// commercial "recovery score" products composite. See
// docs/superpowers/research/2026-08-16-recovery-science.md.
//
// Nothing here is fitted and there are no per-user parameters, because there
// is no ground truth to fit against. A fitted model would be more confident,
// not more correct.
import { MUSCLE_GROUPS, EXERCISE_BY_ID, groupWeightsFor, tauFor } from './muscles'

export const REF_SETS = 6        // fractional sets that make one full stimulus unit
export const NOVELTY_FACTOR = 1.5 // repeated-bout effect
export const NOVELTY_DAYS = 28
export const BANDS = { fresh: 0.75, partly: 0.35 }

const MS_PER_HOUR = 3600_000
const MS_PER_DAY = 86400_000

// logged_at / created_at are UTC written by SQLite's datetime('now') with no
// zone suffix. Same parse idiom as frontend/src/pages/History.jsx:9.
export function parseUtc(ts) {
  return Date.parse(String(ts).replace(' ', 'T') + 'Z')
}

// Clamped at 0: a clock-skewed future timestamp must not produce freshness > 1.
export function hoursSince(ts, nowMs) {
  const ms = nowMs - parseUtc(ts)
  return ms > 0 ? ms / MS_PER_HOUR : 0
}

// Calendar days between two 'YYYY-MM-DD' strings. Both are parsed at UTC
// midnight so DST never shifts the difference off a whole number.
export function daysBetweenDates(fromIso, toIso) {
  const from = Date.parse(fromIso + 'T00:00:00Z')
  const to = Date.parse(toIso + 'T00:00:00Z')
  return Math.round((to - from) / MS_PER_DAY)
}

// sessions.date is written server-LOCAL (backend/main.py uses datetime.now(),
// not datetime('now')), so "3 days ago" must be computed against the client's
// local today — not against a UTC date.
export function localToday(now = new Date()) {
  const pad = n => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function dayLabel(lastDate, todayIso) {
  if (!lastDate) return 'Not trained yet'
  const days = daysBetweenDates(lastDate, todayIso)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return `${days} days ago`
}

// The repeated-bout effect: a first-ever RDL session and the tenth are not the
// same event. prev_date is the only reason /api/exercises/recency carries it.
export function noveltyFor(row) {
  if (!row.prev_date) return NOVELTY_FACTOR
  return daysBetweenDates(row.prev_date, row.last_date) >= NOVELTY_DAYS
    ? NOVELTY_FACTOR
    : 1.0
}

// Three bands, because three is the model's honest resolution. A percentage
// would imply a measurement nobody took.
export function bandFor(freshness) {
  if (freshness === null || freshness === undefined) return 'Not trained yet'
  if (freshness >= BANDS.fresh) return 'Fresh'
  if (freshness >= BANDS.partly) return 'Partly recovered (est.)'
  return 'Recently trained'
}

// load      = min(1, SUM over the group's exercises of
//                     min(1, fractionalSets / 6) x novelty x exp(-hours / tau))
// freshness = 1 - load
//
// Two deliberate deviations from the research doc's formula: the min() cap
// applies per exercise bout rather than per session (tau varies per exercise,
// so a session is not one term), and only each exercise's most recent bout is
// summed (a bout two sessions back contributes <=1.8% at tau <= 24h — below
// the resolution of three bands).
export function groupRecovery(recency, nowMs = Date.now()) {
  const todayIso = localToday(new Date(nowMs))
  const acc = {}
  MUSCLE_GROUPS.forEach(g => {
    acc[g.id] = { load: 0, lastAt: null, lastDate: null, sets: 0 }
  })

  const rows = (recency || []).filter(r => EXERCISE_BY_ID[r.exercise_id])

  // Pass 1 — accumulate decayed load, and find each group's most recent bout.
  rows.forEach(r => {
    const tau = tauFor(r.exercise_id)
    const hours = hoursSince(r.last_at, nowMs)
    const novelty = noveltyFor(r)
    const decay = Math.exp(-hours / tau)
    Object.entries(groupWeightsFor(EXERCISE_BY_ID[r.exercise_id])).forEach(([groupId, w]) => {
      const g = acc[groupId]
      if (!g) return
      g.load += Math.min(1, (r.sets * w) / REF_SETS) * novelty * decay
      if (g.lastDate === null || r.last_date > g.lastDate) {
        g.lastDate = r.last_date
        g.lastAt = r.last_at
      }
    })
  })

  // Pass 2 — fractional sets on that most recent date. Separate pass because
  // it needs each group's winning date, which pass 1 is still discovering.
  rows.forEach(r => {
    Object.entries(groupWeightsFor(EXERCISE_BY_ID[r.exercise_id])).forEach(([groupId, w]) => {
      const g = acc[groupId]
      if (g && r.last_date === g.lastDate) g.sets += r.sets * w
    })
  })

  return MUSCLE_GROUPS.map(group => {
    const g = acc[group.id]
    const trained = g.lastDate !== null
    const freshness = trained ? 1 - Math.min(1, g.load) : null
    return {
      id: group.id,
      label: group.label,
      freshness,
      band: bandFor(freshness),
      hoursSince: trained ? Math.round(hoursSince(g.lastAt, nowMs)) : null,
      daysSince: trained ? daysBetweenDates(g.lastDate, todayIso) : null,
      daysSinceLabel: dayLabel(g.lastDate, todayIso),
      fractionalSets: Math.round(g.sets * 10) / 10,
      lastDate: g.lastDate,
    }
  })
}

// Completed sessions only, matching /api/exercises/recency — otherwise an
// in-progress session would report "Last workout today" before it is finished.
export function lastWorkoutLabel(sessions, nowMs = Date.now()) {
  const done = (sessions || []).filter(s => s.completed)
  if (!done.length) return 'No workouts logged yet'
  const latest = done.reduce((a, b) => (b.date > a.date ? b : a))
  const todayIso = localToday(new Date(nowMs))
  return `Last workout ${dayLabel(latest.date, todayIso).toLowerCase()}`
}
