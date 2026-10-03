import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { api } from '../api'
import { useSession } from './session'
import { clearRestTimer } from './restTimerStorage'

export function findActiveSession(sessions) {
  if (!Array.isArray(sessions)) return null
  return sessions.find(s => !s.completed) ?? null
}

export const ActiveSessionContext = createContext({
  active: null,
  ready: false,
  failed: false,
  refresh: async () => {},
  discard: async () => {},
})

export function ActiveSessionProvider({ children }) {
  const { profile } = useSession()
  const [active, setActive] = useState(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const sessions = await api.get('/sessions')
      setActive(findActiveSession(sessions))
      setFailed(false)
    } catch {
      // Deliberately NOT setActive(null). A rejected read says nothing about
      // whether a session is in progress — it says we could not find out. The
      // 2026-10-03 design review's Wave 1.1 finding: nulling here made Home
      // replace Resume with Start over a live workout, which starts a second
      // session and orphans the first. A stale `active` costs one useless tap
      // (you land on Workout, which loads or shows its own error); a wrong
      // Start costs real data. `failed` is the signal consumers need, so they
      // can avoid offering either action rather than guessing.
      setFailed(true)
    } finally {
      setReady(true)
    }
  }, [])

  const discard = useCallback(async (id) => {
    await api.delete(`/sessions/${id}`)
    clearRestTimer(id)
    await refresh()
  }, [refresh])

  // Follows the session rather than the mount. Fetching once on mount was fine
  // until #86 gated /sessions: logged out the call only 401s, and logging in is
  // a nav() rather than a reload, so `active` stayed null for the whole visit —
  // Home offered "Start" over a workout already in progress and starting one
  // orphaned it. Clearing on the way out matters just as much: a session that
  // ends mid-use must not leave a banner offering to resume something now
  // unreachable.
  useEffect(() => {
    if (profile) refresh()
    else { setActive(null); setFailed(false) }
  }, [profile, refresh])

  return (
    <ActiveSessionContext.Provider value={{ active, ready, failed, refresh, discard }}>
      {children}
    </ActiveSessionContext.Provider>
  )
}

export function useActiveSession() {
  return useContext(ActiveSessionContext)
}
