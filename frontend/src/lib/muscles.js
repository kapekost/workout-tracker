// Muscle taxonomy for the Home picker and the recovery estimate.
//
// The `muscles:` arrays in workoutPlan.js are exercise-level form copy, not a
// taxonomy: 22 exercises carry 22 distinct raw tags at inconsistent
// granularity (`Chest` and `Upper Chest` but no unified chest; six back tags
// but no `Back`). Grouping by raw tag would produce 22 chips, several of which
// nobody thinks in. This module maps them; the plan data stays untouched.
//
// Pure data + pure functions. No time, no network, no React — recovery.js owns
// all the time arithmetic.
import { PLAN, CYCLE } from '../data/workoutPlan'

// Legs split three ways because the plan's own `tag` strings already draw
// those lines ("Quad · Hamstring · Calves").
export const MUSCLE_GROUPS = [
  { id: 'chest',     label: 'Chest',               tags: ['Chest', 'Upper Chest'] },
  { id: 'back',      label: 'Back',                tags: ['Lats', 'Mid Back', 'Rhomboids', 'Traps', 'Spinal Erectors', 'Lower Back'] },
  { id: 'shoulders', label: 'Shoulders',           tags: ['Front Delt', 'Side Delt', 'Rear Delt'] },
  { id: 'arms',      label: 'Arms',                tags: ['Biceps', 'Triceps', 'Triceps (Long Head)', 'Brachialis', 'Forearms'] },
  { id: 'quads',     label: 'Quads',               tags: ['Quads', 'Hip Flexors'] },
  { id: 'posterior', label: 'Hamstrings & Glutes', tags: ['Hamstrings', 'Glutes'] },
  { id: 'calves',    label: 'Calves',              tags: ['Gastrocnemius', 'Soleus'] },
]

const TAG_TO_GROUP = Object.fromEntries(
  MUSCLE_GROUPS.flatMap(g => g.tags.map(t => [t, g.id]))
)

export const ALL_EXERCISES = Object.values(PLAN).flatMap(d => d.exercises)
export const EXERCISE_BY_ID = Object.fromEntries(ALL_EXERCISES.map(e => [e.id, e]))

// All 22 exercises already list their primary muscle first, so direct/indirect
// is positional. This map exists so a future plan edit that breaks that
// assumption is a one-line fix rather than a rewrite of all 22 entries.
// Shape: { exerciseId: 'Raw Tag' } — that tag is treated as direct.
export const DIRECT_TAG_OVERRIDES = {}

// Recovery time constants key off MOVEMENT PATTERN, not muscle size. Dourado
// et al. (2023) compared knee extension against leg press in the same subjects
// on the same muscle: 24h vs 48h to recover peak torque. Nothing supports
// "small muscles recover faster".
export const PATTERN_TAU = {
  isolation: 12,       // anchored to Dourado's 24h single-joint recovery
  compound_upper: 18,  // INTERPOLATED — no study measures this directly
  compound_lower: 24,  // anchored to Dourado's 48h multi-joint recovery
}

export const EXERCISE_PATTERN = {
  tricep_pushdown: 'isolation', db_curl: 'isolation', hammer_curl: 'isolation',
  skull_crusher: 'isolation', lateral_raise: 'isolation', leg_curl: 'isolation',
  leg_ext: 'isolation', standing_calf: 'isolation', seated_calf: 'isolation',

  bench_press: 'compound_upper', incline_press: 'compound_upper',
  ohp: 'compound_upper', bent_row: 'compound_upper', cable_row: 'compound_upper',
  lat_pulldown: 'compound_upper', pullup: 'compound_upper',

  back_squat: 'compound_lower', deadlift: 'compound_lower', rdl: 'compound_lower',
  leg_press: 'compound_lower', bss: 'compound_lower', hip_thrust: 'compound_lower',
}

// Unclassified exercises get the LONGEST tau on purpose: the resulting estimate
// reads as more recently trained, never fresher. Our one-directional error
// budget (unlogged classes can only make us overstate freshness) has no room
// for a default that errs the other way.
export function tauFor(exerciseId) {
  return PATTERN_TAU[EXERCISE_PATTERN[exerciseId]] ?? PATTERN_TAU.compound_lower
}

// Direct ×1.0, indirect ×0.5 — two tiers, not three. Pelland et al. (2025)
// found indirect-as-0.5 best predicts adaptation; there is no evidence for a
// third tier.
//
// An exercise contributes to a group ONCE, at the max weight among its tags in
// that group. cable_row lists Mid Back / Rhomboids / Lats — all `back` — and
// summing would triple-count a single rowing movement.
export function groupWeightsFor(exercise) {
  const out = {}
  if (!exercise?.muscles) return out
  exercise.muscles.forEach((tag, i) => {
    const groupId = TAG_TO_GROUP[tag]
    if (!groupId) return
    const direct = i === 0 || DIRECT_TAG_OVERRIDES[exercise.id] === tag
    const weight = direct ? 1.0 : 0.5
    out[groupId] = Math.max(out[groupId] ?? 0, weight)
  })
  return out
}

export { CYCLE }
