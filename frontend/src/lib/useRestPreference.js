import { useState, useCallback } from 'react'
// #124 (logout wipe): restPrefSec is deliberately *not* cleared on logout --
// see the decision written down at the call site in session.jsx's signOut.
// It's a rest-length duration, not anything that identifies an account.
const KEY = 'restPrefSec'
const canStore = typeof localStorage !== 'undefined'
export function useRestPreference(fallback = 90) {
  const [restPref, setRestPrefState] = useState(() => {
    const v = parseInt((canStore && localStorage.getItem(KEY)) || '', 10)
    return Number.isFinite(v) && v > 0 ? v : fallback
  })
  // Accepts a value OR a functional updater (so rapid ±30 taps compose correctly).
  const setRestPref = useCallback((sec) => {
    setRestPrefState(prev => {
      const next = typeof sec === 'function' ? sec(prev) : sec
      const v = Math.max(0, Math.round(next))
      if (canStore) localStorage.setItem(KEY, String(v))
      return v
    })
  }, [])
  return [restPref, setRestPref]
}
