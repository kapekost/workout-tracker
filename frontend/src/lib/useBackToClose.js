import { useEffect, useRef } from 'react'

// Lets the system Back gesture dismiss an overlay instead of leaving the page.
// Opening pushes one history entry; Back closes; closing any other way pops it.
// The pop on close is deferred one tick and cancelled if the effect runs again
// at once: React StrictMode's dev double-mount would otherwise push, pop and push,
// and the stray pop closes the overlay that just opened.
export default function useBackToClose(onClose) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const pendingBack = useRef(null)
  useEffect(() => {
    if (pendingBack.current) {
      clearTimeout(pendingBack.current)
      pendingBack.current = null
    } else {
      history.pushState({ overlay: true }, '')
    }
    let popped = false
    const onPop = () => { popped = true; closeRef.current() }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      if (popped) return
      pendingBack.current = setTimeout(() => {
        pendingBack.current = null
        if (history.state?.overlay) history.back()
      }, 0)
    }
  }, [])
}
