import { useCallback, useEffect, useRef, useState } from 'react'

// The three destructive-action guards (Workout's × on a set, History's on a
// session, Personal Bests' on a PB) share one shape: a first tap arms, a
// second inside a 3s window confirms, and the window expiring disarms.
//
// One timer, cleared on unmount. Unmounted is the case that matters: a
// setTimeout that outlives its component calls a state setter on a dead
// component, which React reports as an error against whatever is running next
// rather than against the code that caused it. In CI that surfaces as an
// unrelated test failing (#262), and in the app it is a state update nobody is
// left to render.
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
    if (armedId === id) {
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

  // Disarms whatever is armed. Used when a page's data changes underneath the
  // guard, so a deleted row cannot leave the row after it armed.
  const disarm = useCallback(() => {
    clear()
    setArmedId(null)
  }, [clear])

  return { armedId, confirm, disarm }
}