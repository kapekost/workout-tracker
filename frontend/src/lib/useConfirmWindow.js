import { useCallback, useEffect, useRef, useState } from 'react'

// The three destructive-action guards (Workout's × on a set, History's on a
// session, Personal Bests' on a PB) share one shape: a first tap arms, a
// second inside a 3s window confirms, and the window expiring disarms.
//
// One timer, cleared on unmount: a setTimeout that outlives its component calls
// a state setter on a dead component, which React reports as an error against
// whatever is running next rather than against the code that caused it.
export function useConfirmWindow(windowMs = 3000) {
  const [armedId, setArmedId] = useState(null)
  const timer = useRef(null)

  const clear = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }, [])

  useEffect(() => clear, [clear])

  // Returns true when this call was the confirming one, so the caller can act
  // on it without re-reading armedId -- which may already have changed by the
  // time it looks.
  const confirm = useCallback((id) => {
    // Nothing can be armed before a first tap, so a nullish id must arm rather
    // than confirm -- otherwise a caller passing a row with no id deletes it on
    // the first tap.
    if (id != null && armedId === id) {
      clear()
      setArmedId(null)
      return true
    }
    setArmedId(id)
    clear()
    timer.current = setTimeout(() => {
      timer.current = null
      setArmedId((current) => (current === id ? null : current))
    }, windowMs)
    return false
  }, [armedId, clear, windowMs])

  return { armedId, confirm }
}