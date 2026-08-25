import { useCallback, useRef, useState } from 'react'

// Shared toast dismissal state machine (design-system inventory §3.2f) — the
// useState + setTimeout(…, 2500) pair reimplemented at all 5 call sites
// (Workout.jsx, Home.jsx ×2, History.jsx, PersonalBests.jsx) despite a
// single shared `.toast` CSS class, now owned once.
//
// Same 2500ms dismiss delay as every site it replaces. Unlike those sites,
// a second showToast() call clears the previous pending timer before
// starting a new one, so a toast shown while an earlier one is still fading
// out gets its own full 2500ms instead of being cut short by the first
// call's timeout firing on schedule.
const DISMISS_MS = 2500

export function useToast() {
  const [toast, setToast] = useState(null)
  const timeoutRef = useRef(null)

  const showToast = useCallback((message, type = 'default') => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setToast({ message, type })
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null
      setToast(null)
    }, DISMISS_MS)
  }, [])

  return { toast, showToast }
}
