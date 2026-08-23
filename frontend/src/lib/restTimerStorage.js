// restStartMs/pausedRem lived only in Workout.jsx's local state, so
// navigating to Home/Progress/History and back (or a full page reload)
// unmounted the page and silently reset a running rest timer back to idle.
// restStartMs is an absolute epoch-ms timestamp, so persisting it and
// restoring it later reproduces exactly what remainingSeconds() would have
// shown had the tab never left this page.
const PREFIX = 'restTimer:'
const canStore = typeof localStorage !== 'undefined'

export function loadRestTimer(sessionId) {
  if (!canStore) return null
  try {
    const raw = localStorage.getItem(PREFIX + sessionId)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return { restStartMs: parsed.restStartMs ?? null, pausedRem: parsed.pausedRem ?? null }
  } catch { return null }
}

export function saveRestTimer(sessionId, { restStartMs, pausedRem }) {
  if (!canStore) return
  try {
    if (restStartMs == null && pausedRem == null) {
      localStorage.removeItem(PREFIX + sessionId)
      return
    }
    localStorage.setItem(PREFIX + sessionId, JSON.stringify({ restStartMs, pausedRem }))
  } catch { /* storage unavailable/full; timer just won't survive navigation */ }
}

export function clearRestTimer(sessionId) {
  if (!canStore) return
  try { localStorage.removeItem(PREFIX + sessionId) } catch {}
}
