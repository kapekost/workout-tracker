import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { PLAN, getNextWorkoutId, DAY_COLORS } from '../data/workoutPlan'

export default function Home() {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [toast, setToast] = useState(null)
  const nav = useNavigate()

  useEffect(() => {
    api.get('/sessions').then(s => { setSessions(s); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const nextId = getNextWorkoutId(sessions)
  const next = PLAN[nextId]
  const color = DAY_COLORS[nextId]

  const lastSession = sessions[0]
  const lastPlan = lastSession ? PLAN[lastSession.workout_day] : null

  async function startWorkout() {
    setStarting(true)
    try {
      const s = await api.post('/sessions', { workout_day: nextId })
      nav(`/workout/${s.id}`)
    } catch (e) {
      setToast('Failed to start — is the backend up?')
      setTimeout(() => setToast(null), 2500)
      setStarting(false)
    }
  }

  if (loading) return (
    <div style={{ paddingTop: 80, textAlign: 'center', color: '#9ca3af' }}>Loading…</div>
  )

  return (
    <div style={{ paddingTop: 32 }}>
      {toast && <div className="toast error">{toast}</div>}
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <p style={{ color: '#6ee7b7', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
          Next up
        </p>
        <h1 style={{ fontSize: '2rem', fontWeight: 700, lineHeight: 1.1 }}>
          {next.emoji} {next.name}
        </h1>
        <p style={{ color: '#6b7280', marginTop: 6, fontSize: '0.875rem' }}>{next.tag}</p>
      </div>

      {/* Exercise preview */}
      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <p style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
          {next.exercises.length} exercises
        </p>
        {next.exercises.map((ex, i) => (
          <div key={ex.id} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '10px 0',
            borderBottom: i < next.exercises.length - 1 ? '1px solid #1e1e32' : 'none'
          }}>
            <div>
              <p style={{ fontWeight: 600, fontSize: '0.9rem' }}>{ex.name}</p>
              {ex.alt && <p style={{ color: '#6b7280', fontSize: '0.75rem' }}>{ex.alt}</p>}
            </div>
            <p className="font-mono" style={{ color, fontSize: '0.8rem', fontWeight: 700, whiteSpace: 'nowrap', marginLeft: 12 }}>
              {ex.sets}×{ex.repsLow}–{ex.repsHigh}
            </p>
          </div>
        ))}
      </div>

      {/* Start button */}
      <button className="btn-primary" onClick={startWorkout} disabled={starting}
        style={{ background: color, marginBottom: 32 }}>
        {starting ? 'Starting…' : `Start ${next.name}`}
      </button>

      {/* Last session */}
      {lastSession && lastPlan && (
        <div>
          <p style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
            Last session
          </p>
          <div className="card" style={{ padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            onClick={() => nav('/history')}>
            <div>
              <p style={{ fontWeight: 600 }}>{lastPlan.emoji} {lastPlan.name}</p>
              <p style={{ color: '#9ca3af', fontSize: '0.8rem', marginTop: 2 }}>{lastSession.date}</p>
            </div>
            <span style={{ color: '#9ca3af', fontSize: '1.2rem' }}>›</span>
          </div>
        </div>
      )}

      {sessions.length === 0 && (
        <div className="card" style={{ padding: 24, textAlign: 'center' }}>
          <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>No sessions logged yet.</p>
          <p style={{ color: '#9ca3af', fontSize: '0.8rem', marginTop: 4 }}>Start your first workout above 💪</p>
        </div>
      )}
    </div>
  )
}
