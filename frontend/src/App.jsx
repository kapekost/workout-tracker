import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Home from './pages/Home'
import Workout from './pages/Workout'
import Exercise from './pages/Exercise'
import Progress from './pages/Progress'
import History from './pages/History'
import NavBar from './components/NavBar'
import TopBar from './components/TopBar'
import ResumeBanner from './components/ResumeBanner'
import ScreenTracker from './components/ScreenTracker'
import { ActiveSessionProvider } from './lib/activeSession'

export default function App() {
  return (
    <BrowserRouter>
      <ActiveSessionProvider>
        <ScreenTracker />
        <div style={{ background: '#0a0a12', minHeight: '100dvh' }}>
          <div style={{ position: 'sticky', top: 0, zIndex: 45 }}>
            <TopBar />
            <ResumeBanner />
          </div>
          <div className="max-w-md mx-auto pb-24 px-4">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/workout/:sessionId" element={<Workout />} />
              <Route path="/exercise/:workoutDay/:exerciseId" element={<Exercise />} />
              <Route path="/progress" element={<Progress />} />
              <Route path="/history" element={<History />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </div>
          <NavBar />
        </div>
      </ActiveSessionProvider>
    </BrowserRouter>
  )
}
