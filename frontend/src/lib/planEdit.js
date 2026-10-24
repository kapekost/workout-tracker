export const PLAN_UPDATE_SCHEMA = 'workout-tracker/plan-update/v1'

export function planUpdateBody(dayKey, exerciseUpdates) {
  return {
    envelope: {
      schema: PLAN_UPDATE_SCHEMA,
      summary: 'Edited in the app',
      day_updates: [{ day_key: dayKey, exercise_updates: exerciseUpdates }],
    },
    confirm: true,
  }
}

// Only the fields that differ from the plan go on the wire. Null when nothing
// changed, so the caller can skip the request.
export function modifyOp(exercise, draft) {
  const op = { op: 'modify', exercise_id: exercise.id }
  if (draft.sets !== exercise.sets) op.sets = draft.sets
  if (draft.repsLow !== exercise.repsLow) op.reps_low = draft.repsLow
  if (draft.repsHigh !== exercise.repsHigh) op.reps_high = draft.repsHigh
  if ('altId' in draft && draft.altId !== (exercise.altExercise?.id ?? null)) op.alt_id = draft.altId
  return Object.keys(op).length > 2 ? op : null
}

// Every catalog exercise except the one being edited, by name: the alternative
// may be anything, including an exercise that is also on another day.
export function altCandidates(catalog, exercise) {
  return catalog
    .filter(c => c.exercise_id !== exercise.id)
    .sort((a, b) => a.name.localeCompare(b.name))
}

// Catalog entries not already anywhere in the plan, most shared muscles first.
export function rankSwapCandidates(catalog, plan, replaced) {
  const inPlan = new Set(Object.values(plan).flatMap(d => d.exercises.map(e => e.id)))
  const wanted = new Set(replaced.muscles)
  return catalog
    .filter(c => !inPlan.has(c.exercise_id))
    .map(c => ({ c, overlap: (c.muscles ?? []).filter(m => wanted.has(m)).length }))
    .sort((a, b) => b.overlap - a.overlap || a.c.name.localeCompare(b.c.name))
    .map(({ c }) => c)
}
