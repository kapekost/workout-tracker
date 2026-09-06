import { useLayoutEffect, useRef, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Home from './pages/Home'
import Workout from './pages/Workout'
import Exercise from './pages/Exercise'
import Progress from './pages/Progress'
import History from './pages/History'
import PersonalBests from './pages/PersonalBests'
import Login from './pages/Login'
import SetPassword from './pages/SetPassword'
import NavBar from './components/NavBar'
import TopBar from './components/TopBar'
import ResumeBanner from './components/ResumeBanner'
import ScreenTracker from './components/ScreenTracker'
import { ActiveSessionProvider } from './lib/activeSession'
import { SessionProvider, useSession } from './lib/session'
import { colors } from './lib/theme'

// Sends you to the door and remembers which one you knocked on, so logging in
// resumes there instead of dumping everyone on Home. `replace` keeps the
// bounced-off path out of history: back from /login should leave the app, not
// re-run the redirect that put you there.
function RedirectToLogin() {
  const { pathname, search } = useLocation()
  return <Navigate to="/login" replace state={{ from: pathname + search }} />
}

// The two screens that stay reachable with no session. /set-password is not a
// courtesy: it is the link the invite and reset emails carry, and the token in
// it is the only way into a brand-new account. Gating it would redirect a new
// user to a login screen they have no password for, permanently. #120 broke
// the same email from the server side -- every deep link 404ing -- and made it
// unopenable for days.
function PublicRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/set-password" element={<SetPassword />} />
      <Route path="*" element={<RedirectToLogin />} />
    </Routes>
  )
}

// Both auth screens stay routed here too: a logged-in user can still be sent a
// reset link, and /login reached from a bookmark should render rather than
// bounce. They just have no path that forces them.
function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/workout/:sessionId" element={<Workout />} />
      <Route path="/exercise/:workoutDay/:exerciseId" element={<Exercise />} />
      <Route path="/progress" element={<Progress />} />
      <Route path="/history" element={<History />} />
      <Route path="/personal-bests" element={<PersonalBests />} />
      <Route path="/login" element={<Login />} />
      {/* The path the invite and reset emails already point at —
          {APP_BASE_URL}/set-password?token=<raw>. */}
      <Route path="/set-password" element={<SetPassword />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  )
}

function Shell() {
  // One decision point for the whole app: `profile` picks the route table, so
  // an app page is never even mounted without a session and never fires the
  // request that would only 401 back. Clearing the profile -- on logout, or
  // when api.js reports a session that ended mid-use -- swaps the tables and
  // lands on the login screen without anyone calling navigate().
  const { ready, profile } = useSession()
  const headerRef = useRef(null)
  const [headerHeight, setHeaderHeight] = useState(0)

  // `position: sticky` still travels with the page during iOS's rubber-band
  // overscroll bounce. Only a `fixed` header stays pinned through it, so the
  // header's height (which changes when ResumeBanner mounts) has to be
  // tracked explicitly and applied as padding on the scroll content. Keyed on
  // `ready` because the header does not exist during the wait below.
  useLayoutEffect(() => {
    const el = headerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => setHeaderHeight(entry.contentRect.height))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ready])

  return (
    <div style={{ background: colors.bg, minHeight: '100dvh' }}>
      {/* Nothing at all until /auth/me answers -- not the app, and above all
          not the login screen. That request is in flight on every load, so
          rendering "logged out" while it is would blink the door at a
          logged-in user on every single refresh. A spinner would be its own
          flicker for a same-origin request that answers in tens of
          milliseconds; an empty page in the app's own background colour is
          what index.html already paints, so the wait reads as the app still
          booting, which is what it is. */}
      {ready && (
        <>
          <div ref={headerRef} style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 45 }}>
            <TopBar />
            {/* A workout in progress is a statement about your session. Left
                mounted, it would sit above the login screen after a logout
                offering to resume something you can no longer reach. */}
            {profile && <ResumeBanner />}
          </div>
          {/* --header-height lets a page size itself against the space the
              fixed header actually leaves it (index.css's .auth-shell). */}
          <div className="page-shell" style={{ paddingTop: headerHeight, '--header-height': `${headerHeight}px` }}>
            {profile ? <AppRoutes /> : <PublicRoutes />}
          </div>
          <NavBar />
        </>
      )}
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <ActiveSessionProvider>
          <ScreenTracker />
          <Shell />
        </ActiveSessionProvider>
      </SessionProvider>
    </BrowserRouter>
  )
}
