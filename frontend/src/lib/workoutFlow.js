import { overloadSuggestion } from './overload'

export function nextIncompleteExerciseId(exercises, sets) {
  for (const ex of exercises) {
    const done = sets.filter(s => s.exercise_id === ex.id).length
    if (done < ex.sets) return ex.id
  }
  return null
}

export function prefillFor(exerciseId, sets, progressMaxByExercise = {}, lastSets = null, exMeta = {}) {
  const { repsHigh = null, bodyweight = false } = exMeta
  const exSets = sets.filter(s => s.exercise_id === exerciseId)
  if (exSets.length) {
    const last = exSets[exSets.length - 1]
    return { weight: last.weight_kg, reps: last.reps }
  }
  // lastSets is the full /last response object ({ sets, suggestion? }) at the
  // real call sites, but existing tests (and some callers) still pass the
  // raw sets array directly -- both shapes are honored here. A backend
  // suggestion wins outright when present; an array has no `.suggestion` of
  // its own, so it always falls through to the raw-sets branch below.
  const suggestion = lastSets && lastSets.suggestion
  if (suggestion && suggestion.weight_kg != null && suggestion.reps != null) {
    return { weight: suggestion.weight_kg, reps: suggestion.reps }
  }
  const rawSets = Array.isArray(lastSets)
    ? lastSets
    : (lastSets && Array.isArray(lastSets.sets) ? lastSets.sets : null)
  if (rawSets && rawSets.length) {
    // Match the "Suggested Xkg" progressive-overload hint shown next to last
    // workout's sets. Starting the input at last time's raw weight instead
    // made the prefill silently ignore the plan's own progression.
    const sug = repsHigh != null ? overloadSuggestion(rawSets, repsHigh) : null
    return { weight: sug ? sug.weight : rawSets[0].weight_kg, reps: rawSets[0].reps }
  }
  const pm = progressMaxByExercise[exerciseId]
  if (pm != null) return { weight: pm.weight, reps: pm.reps ?? 8 }
  return { weight: bodyweight ? 0 : 20, reps: 8 }
}

export function nextSetNumber(sets) {
  // max+1, not count+1: after deleting set 1 of [1,2], the next set must be 3
  // or History would show two "Set 2" rows.
  return sets.reduce((m, s) => Math.max(m, s.set_number), 0) + 1
}
