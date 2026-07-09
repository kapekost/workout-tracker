export function nextIncompleteExerciseId(exercises, sets) {
  for (const ex of exercises) {
    const done = sets.filter(s => s.exercise_id === ex.id).length
    if (done < ex.sets) return ex.id
  }
  return null
}

export function prefillFor(exerciseId, sets, progressMaxByExercise = {}, lastSets = null) {
  const exSets = sets.filter(s => s.exercise_id === exerciseId)
  if (exSets.length) {
    const last = exSets[exSets.length - 1]
    return { weight: last.weight_kg, reps: last.reps }
  }
  if (Array.isArray(lastSets) && lastSets.length) {
    return { weight: lastSets[0].weight_kg, reps: lastSets[0].reps }
  }
  const pm = progressMaxByExercise[exerciseId]
  if (pm != null) return { weight: pm, reps: 8 }
  return { weight: 20, reps: 8 }
}

export function nextSetNumber(sets) {
  // max+1, not count+1: after deleting set 1 of [1,2], the next set must be 3
  // or History would show two "Set 2" rows.
  return sets.reduce((m, s) => Math.max(m, s.set_number), 0) + 1
}
