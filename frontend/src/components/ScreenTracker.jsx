import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { track } from '../lib/analytics'

export default function ScreenTracker() {
  const { pathname } = useLocation()
  useEffect(() => {
    track('screen_view', { path: pathname })
    const t0 = Date.now()
    return () => track('time_on_screen', { path: pathname, ms: Date.now() - t0 })
  }, [pathname])
  return null
}
