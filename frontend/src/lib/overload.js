export function overloadSuggestion(lastSets, repsHigh, increment = 2.5) {
  if (!Array.isArray(lastSets) || lastSets.length === 0) return null
  const topWeight = Math.max(...lastSets.map(s => s.weight_kg))
  const allHit = lastSets.every(s => s.reps >= repsHigh)
  return allHit ? { weight: topWeight + increment, hitTarget: true }
                : { weight: topWeight, hitTarget: false }
}
