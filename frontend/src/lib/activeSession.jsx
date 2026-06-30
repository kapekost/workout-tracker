import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { api } from '../api'

export function findActiveSession(sessions) {
  if (!Array.isArray(sessions)) return null
  return sessions.find(s => !s.completed) ?? null
}

export const ActiveSessionContext = createContext({
  active: null,
  ready: false,
  refresh: async () => {},
  discard: async () => {},
})

export function ActiveSessionProvider({ children }) {
  const [active, setActive] = useState(null)
  const [ready, setReady] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const sessions = await api.get('/sessions')
      setActive(findActiveSession(sessions))
    } catch {
      setActive(null)
    } finally {
      setReady(true)
    }
  }, [])

  const discard = useCallback(async (id) => {
    await api.delete(`/sessions/${id}`)
    await refresh()
  }, [refresh])

  useEffect(() => { refresh() }, [refresh])

  return (
    <ActiveSessionContext.Provider value={{ active, ready, refresh, discard }}>
      {children}
    </ActiveSessionContext.Provider>
  )
}

export function useActiveSession() {
  return useContext(ActiveSessionContext)
}
