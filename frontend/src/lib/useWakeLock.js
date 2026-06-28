import { useEffect, useRef, useState } from 'react'

// Keeps the screen awake while `active`. Re-acquires on tab re-focus (the lock
// auto-releases when the tab hides). No-op where unsupported.
export function useWakeLock(active) {
  const lockRef = useRef(null)
  const [held, setHeld] = useState(false)
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator

  useEffect(() => {
    if (!active || !supported) return
    let cancelled = false
    let acquiring = false

    const acquire = async () => {
      // Skip if a request is already in-flight or we already hold a lock —
      // prevents a hide→show race from creating (and leaking) a second lock.
      if (acquiring || lockRef.current) return
      acquiring = true
      try {
        const lock = await navigator.wakeLock.request('screen')
        if (cancelled) { lock.release().catch(() => {}); return }
        lockRef.current = lock
        setHeld(true)
        lock.addEventListener('release', () => setHeld(false))
      } catch { setHeld(false) }
      finally { acquiring = false }
    }
    const onVisible = () => { if (document.visibilityState === 'visible') acquire() }

    acquire()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      const l = lockRef.current
      lockRef.current = null
      setHeld(false)
      if (l) l.release().catch(() => {})
    }
  }, [active, supported])

  return { supported, held }
}
