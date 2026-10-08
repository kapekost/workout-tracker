import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api } from '../api'
import { useSession } from './session'

// The default is an empty plan that is already ready, so a component rendered
// outside the provider (an unwrapped unit test, say) degrades to "no days"
// instead of throwing, and nothing waits on a fetch that is not coming.
export const PlanContext = createContext({
  plan: {}, cycle: [], ready: true, failed: false, retry: () => {},
})

const EMPTY = { id: undefined, plan: {}, cycle: [], settled: false, failed: false }

export function PlanProvider({ children }) {
  const { profile } = useSession()
  const profileId = profile?.id
  const [data, setData] = useState(EMPTY)
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => setAttempt(n => n + 1), [])

  useEffect(() => {
    if (profileId == null) {
      setData(EMPTY)
      return
    }
    let cancelled = false
    setData({ id: profileId, plan: {}, cycle: [], settled: false, failed: false })
    api.get('/plan')
      .then(r => {
        if (cancelled) return
        setData({ id: profileId, plan: r?.plan ?? {}, cycle: r?.cycle ?? [], settled: true, failed: false })
      })
      // An empty plan stands for "could not ask", not "no workouts", so the
      // app shows a retry instead of pages that make claims from it.
      .catch(() => { if (!cancelled) setData(d => ({ ...d, settled: true, failed: true })) })
    // Only a request that settles sets `settled`, and a server that accepts the
    // connection and never answers settles nothing. The app waits on `ready`,
    // so the wait is capped and counts as a failure until the answer arrives.
    // A late answer still swaps in and clears it.
    const t = setTimeout(() => {
      if (!cancelled) setData(d => (d.settled ? d : { ...d, settled: true, failed: true }))
    }, 5000)
    return () => { cancelled = true; clearTimeout(t) }
  }, [profileId, attempt])

  // Derived from the profile on every render, not from the effect, so the
  // render in which an account changes can never expose the previous account's
  // plan or report ready before the new one has been asked for.
  const mine = profileId != null && data.id === profileId
  const value = {
    plan: mine ? data.plan : EMPTY.plan,
    cycle: mine ? data.cycle : EMPTY.cycle,
    ready: profileId == null || (mine && data.settled),
    failed: mine && data.failed,
    retry,
  }

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>
}

export function usePlan() {
  return useContext(PlanContext)
}
