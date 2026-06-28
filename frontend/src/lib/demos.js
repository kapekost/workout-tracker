import DEMOS from '../data/exerciseDemos.json'

export function getDemoUrl(exerciseId, demos = DEMOS) {
  const url = demos[exerciseId]
  return url ? url : null
}
