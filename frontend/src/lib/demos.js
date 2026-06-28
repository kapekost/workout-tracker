import DEMOS from '../data/exerciseDemos.json'

// Returns the array of demo frame URLs for an exercise, or null when none
// exist (caller falls back to the YouTube link).
export function getDemoFrames(exerciseId, demos = DEMOS) {
  const frames = demos[exerciseId]
  return Array.isArray(frames) && frames.length ? frames : null
}
