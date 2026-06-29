import { useState, useCallback } from 'react'
const KEY = 'restPrefSec'
export function useRestPreference(fallback = 90) {
  const [restPref, setRestPrefState] = useState(() => {
    const v = parseInt(localStorage.getItem(KEY) || '', 10)
    return Number.isFinite(v) && v > 0 ? v : fallback
  })
  const setRestPref = useCallback((sec) => {
    const v = Math.max(0, Math.round(sec))
    setRestPrefState(v); localStorage.setItem(KEY, String(v))
  }, [])
  return [restPref, setRestPref]
}
