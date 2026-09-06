import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { auth, onUnauthorized } from '../api'

// The default value is a real "no session" state rather than null or a throw.
// The gate (#86) lives in App's route tables, not in this hook, so a component
// rendered outside the provider -- in a test, or anywhere else -- must still
// render logged-out rather than blow up. `ready: true` here because there is
// no lookup in flight to wait for.
export const SessionContext = createContext({
  profile: null,
  ready: true,
  signIn: () => {},
  signOut: async () => {},
})

export function SessionProvider({ children }) {
  const [profile, setProfile] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // A 401 here is the logged-out answer, not a failure -- it is how the app
    // asks the question. Everything waits on `ready` rather than on the shape
    // of the answer.
    auth.me().then(setProfile).catch(() => setProfile(null)).finally(() => setReady(true))
  }, [])

  // api.js has no router, so a 401 from a data endpoint -- a session that
  // expired between page loads -- arrives here instead. Dropping the profile
  // is the whole response: App's guard reads it and renders the login screen,
  // which keeps the redirect in exactly one place.
  useEffect(() => onUnauthorized(() => setProfile(null)), [])

  const signIn = useCallback((p) => setProfile(p), [])

  const signOut = useCallback(async () => {
    // Never rejects, and the local state clears either way. If the request
    // failed the cookie may outlive it, but leaving the UI claiming a session
    // the user just ended would be the worse lie -- and /auth/me corrects it
    // on the next load. Nothing a caller could usefully do with the error.
    try { await auth.logout() } catch { /* offline logout is still a logout */ }
    setProfile(null)
  }, [])

  return (
    <SessionContext.Provider value={{ profile, ready, signIn, signOut }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSession() {
  return useContext(SessionContext)
}
