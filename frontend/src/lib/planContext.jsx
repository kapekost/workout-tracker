import { createContext, useContext, useEffect, useState } from 'react'
import { api } from '../api'
import { useSession } from './session'

// The default is an empty plan that is already ready, so a component rendered
// outside the provider (an unwrapped unit test, say) degrades to "no days"
// instead of throwing, and nothing waits on a fetch that is not coming.
export const PlanContext = createContext({ plan: {}, cycle: [], ready: true })

const EMPTY = { id: undefined, plan: {}, cycle: [], settled: false }

export function PlanProvider({ children }) {
  const { profile } = useSession()
  const profileId = profile?.id
  const [data, setData] = useState(EMPTY)

  useEffect(() => {
    if (profileId == null) {
      setData(EMPTY)
      return
    }
    let cancelled = false
    setData({ id: profileId, plan: {}, cycle: [], settled: false })
    api.get('/plan')
      .then(r => {
        if (cancelled) return
        setData({ id: profileId, plan: r?.plan ?? {}, cycle: r?.cycle ?? [], settled: true })
      })
      // A failed read degrades to an empty plan rather than blocking the app on
      // a screen with no way forward.
      .catch(() => { if (!cancelled) setData(d => ({ ...d, settled: true })) })
    // Only a request that settles sets `settled`, and a server that accepts the
    // connection and never answers settles nothing. The app waits on `ready`,
    // so the wait is capped. A late answer still arrives and swaps in.
    const t = setTimeout(() => { if (!cancelled) setData(d => ({ ...d, settled: true })) }, 5000)
    return () => { cancelled = true; clearTimeout(t) }
  }, [profileId])

  // Derived from the profile on every render, not from the effect, so the
  // render in which an account changes can never expose the previous account's
  // plan or report ready before the new one has been asked for.
  const mine = profileId != null && data.id === profileId
  const value = {
    plan: mine ? data.plan : EMPTY.plan,
    cycle: mine ? data.cycle : EMPTY.cycle,
    ready: profileId == null || (mine && data.settled),
  }

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>
}

export function usePlan() {
  return useContext(PlanContext)
}
