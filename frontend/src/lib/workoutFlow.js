export function nextIncompleteExerciseId(exercises, sets) {
  for (const ex of exercises) {
    const done = sets.filter(s => s.exercise_id === ex.id).length
    if (done < ex.sets) return ex.id
  }
  return null
}

export function prefillFor(exerciseId, sets, progressMaxByExercise = {}) {
  const exSets = sets.filter(s => s.exercise_id === exerciseId)
  if (exSets.length) {
    const last = exSets[exSets.length - 1]
    return { weight: last.weight_kg, reps: last.reps }
  }
  const pm = progressMaxByExercise[exerciseId]
  if (pm != null) return { weight: pm, reps: 8 }
  return { weight: 20, reps: 8 }
}
