export function elapsedSeconds(startMs, nowMs) {
  return Math.max(0, Math.floor((nowMs - startMs) / 1000))
}

export function remainingSeconds(startMs, targetSeconds, nowMs) {
  return Math.max(0, targetSeconds - elapsedSeconds(startMs, nowMs))
}

export function formatClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds))
  const sec = String(s % 60).padStart(2, '0')
  const min = Math.floor(s / 60) % 60
  const hr = Math.floor(s / 3600)
  if (hr > 0) return `${hr}:${String(min).padStart(2, '0')}:${sec}`
  return `${min}:${sec}`
}
