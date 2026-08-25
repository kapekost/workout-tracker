import { useLayoutEffect, useRef, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Home from './pages/Home'
import Workout from './pages/Workout'
import Exercise from './pages/Exercise'
import Progress from './pages/Progress'
import History from './pages/History'
import PersonalBests from './pages/PersonalBests'
import NavBar from './components/NavBar'
import TopBar from './components/TopBar'
import ResumeBanner from './components/ResumeBanner'
import ScreenTracker from './components/ScreenTracker'
import { ActiveSessionProvider } from './lib/activeSession'
import { colors } from './lib/theme'

export default function App() {
  const headerRef = useRef(null)
  const [headerHeight, setHeaderHeight] = useState(0)

  // `position: sticky` still travels with the page during iOS's rubber-band
  // overscroll bounce. Only a `fixed` header stays pinned through it, so the
  // header's height (which changes when ResumeBanner mounts) has to be
  // tracked explicitly and applied as padding on the scroll content.
  useLayoutEffect(() => {
    const el = headerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => setHeaderHeight(entry.contentRect.height))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <BrowserRouter>
      <ActiveSessionProvider>
        <ScreenTracker />
        <div style={{ background: colors.bg, minHeight: '100dvh' }}>
          <div ref={headerRef} style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 45 }}>
            <TopBar />
            <ResumeBanner />
          </div>
          <div className="max-w-md mx-auto pb-24 px-4" style={{ paddingTop: headerHeight }}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/workout/:sessionId" element={<Workout />} />
              <Route path="/exercise/:workoutDay/:exerciseId" element={<Exercise />} />
              <Route path="/progress" element={<Progress />} />
              <Route path="/history" element={<History />} />
              <Route path="/personal-bests" element={<PersonalBests />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </div>
          <NavBar />
        </div>
      </ActiveSessionProvider>
    </BrowserRouter>
  )
}
