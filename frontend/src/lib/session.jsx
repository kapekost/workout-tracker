import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { auth, onUnauthorized } from '../api'
import { clearAllRestTimers } from './restTimerStorage'
import { apiReadsCacheName } from '../../apiCacheName.js'

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
    // ...but only a request that *settles* sets `ready`, and a server that
    // accepts the connection and then never answers settles nothing. App renders
    // nothing at all until `ready`, so that is a blank page with no text and no
    // way to retry -- exactly the window scripts/deploy.sh spends up to ~30s
    // retrying through after a container restart. 5s: far longer than the tens
    // of milliseconds a same-origin /auth/me takes, so a healthy load never
    // races it and nobody is blinked at the login screen; short enough that a
    // stalled one degrades to a screen you can act on. A late answer still
    // arrives and swaps the app in.
    const t = setTimeout(() => setReady(true), 5000)
    return () => clearTimeout(t)
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

    // #124: this is an installed, offline-capable PWA on a phone that goes to
    // a gym -- "logged out" has to mean the next person holding it cannot
    // read the previous person's training history, online or off. Everything
    // below runs unconditionally, same as clearing `profile` above, because
    // the offline-logout acceptance criterion depends on the network call
    // above being allowed to fail without skipping any of it.

    // Per-session rest-timer state is keyed by session id (restTimer:<id> in
    // localStorage) and is the one thing here that actually leaks -- it names
    // session ids belonging to the account that just left.
    clearAllRestTimers()

    // restPrefSec (useRestPreference.js) is left alone deliberately: it is a
    // rest-length *duration*, not workout data or anything that identifies
    // the account -- closer to a device setting like screen brightness than
    // to account data. Issue #124 leaves the call open; this is the call,
    // written down at the point it's made.

    // The service worker's api-reads-<commit> cache (see apiCacheName.js and
    // #142) holds real API response bodies -- the account's actual workout
    // data -- cached for offline reads. It's scoped to the *current* build's
    // commit, so only that one name needs deleting; api-cache-cleanup.js
    // (#142) separately sweeps every *other*-commit api-reads-* cache at
    // service-worker activate time, which is a different lifecycle event.
    // Guarded the same way the storage helpers guard `localStorage`: `caches`
    // doesn't exist in the vitest/jsdom test environment.
    if (typeof caches !== 'undefined') {
      try { await caches.delete(apiReadsCacheName(__APP_COMMIT__)) } catch { /* best effort */ }
    }
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
