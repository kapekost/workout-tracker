export function summarize(sets, prsBefore = {}) {
  const totalSets = sets.length
  const totalVolume = sets.reduce((sum, s) => sum + s.weight_kg * s.reps, 0)

  const bestByEx = {}      // exercise_id -> { name, weight }
  for (const s of sets) {
    const cur = bestByEx[s.exercise_id]
    if (!cur || s.weight_kg > cur.weight) {
      bestByEx[s.exercise_id] = { name: s.exercise_name, weight: s.weight_kg }
    }
  }

  const exerciseCount = Object.keys(bestByEx).length
  const prs = Object.entries(bestByEx)
    .filter(([id, best]) => prsBefore[id] == null || best.weight > prsBefore[id])
    .map(([, best]) => ({ name: best.name, weight: best.weight }))

  return { totalSets, totalVolume, exerciseCount, prs }
}
