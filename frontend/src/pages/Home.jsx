import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { PLAN, getNextWorkoutId, DAY_COLORS, DAY_COLOR_FALLBACK, CYCLE } from '../data/workoutPlan'
import { useActiveSession } from '../lib/activeSession'
import { track } from '../lib/analytics'
import { downloadExport } from '../lib/exportData'
import { groupRecovery, lastWorkoutLabel } from '../lib/recovery'
import MuscleGroupPicker from '../components/MuscleGroupPicker'
import Eyebrow from '../components/Eyebrow'
import { colors, type } from '../lib/theme'

export function planForDay(workoutDay) {
  return PLAN[workoutDay] || { emoji: '🏋', name: 'Workout', tag: '', exercises: [] }
}

// Most recent COMPLETED session date per plan day. Feeds bestDayForMuscle's
// tie-break; derived from the /sessions response Home already fetches, so the
// picker costs exactly one extra request (/exercises/recency), not two.
export function lastTrainedByDay(sessions) {
  const out = {}
  ;(sessions || []).forEach(s => {
    if (!s.completed || !CYCLE.includes(s.workout_day)) return
    if (!out[s.workout_day] || s.date > out[s.workout_day]) {
      out[s.workout_day] = s.date
    }
  })
  return out
}

// Build commit injected by Vite at build time — answers "which version is the
// phone actually running?" without digging into image IDs.
export function VersionStamp() {
  return (
    <p className="font-mono" style={{ marginTop: 8, textAlign: 'center',
      color: '#4b5563', fontSize: type.size.xs }}>
      v {__APP_COMMIT__}
    </p>
  )
}

export function StartOrResumeButton({ active, plan, color, starting, onStart, onResume }) {
  if (active) {
    return (
      <button className="btn-primary" onClick={onResume}
        style={{ background: color, marginBottom: 32 }}>
        Resume {plan.name}
      </button>
    )
  }
  return (
    <button className="btn-primary" onClick={onStart} disabled={starting}
      style={{ background: color, marginBottom: 32 }}>
      {starting ? 'Starting…' : `Start ${plan.name}`}
    </button>
  )
}

export default function Home() {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [toast, setToast] = useState(null)
  const [recency, setRecency] = useState([])
  const nav = useNavigate()
  const { active, refresh, ready } = useActiveSession()

  useEffect(() => {
    api.get('/sessions').then(s => { setSessions(s); setLoading(false) }).catch(() => setLoading(false))
    // The picker is additive — if this fails, Home still works without it.
    api.get('/exercises/recency').then(setRecency).catch(() => setRecency([]))
  }, [])

  const nextId = getNextWorkoutId(sessions)
  const displayId = active ? active.workout_day : nextId
  const next = planForDay(displayId)
  const color = DAY_COLORS[displayId] || DAY_COLOR_FALLBACK

  const lastSession = sessions[0]
  const lastPlan = lastSession ? PLAN[lastSession.workout_day] : null

  const groups = groupRecovery(recency)
  const trainedByDay = lastTrainedByDay(sessions)

  async function startDay(dayId) {
    setStarting(true)
    try {
      const s = await api.post('/sessions', { workout_day: dayId })
      track('session_start', { day: dayId })
      await refresh()
      nav(`/workout/${s.id}`)
    } catch (e) {
      setToast('Failed to start — is the backend up?')
      setTimeout(() => setToast(null), 2500)
      setStarting(false)
    }
  }

  const startWorkout = () => startDay(nextId)

  if (loading || !ready) return (
    <div style={{ paddingTop: 32, textAlign: 'center', color: colors.muted }}>Loading…</div>
  )

  return (
    <div style={{ paddingTop: 16 }}>
      {toast && <div className="toast error">{toast}</div>}
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <Eyebrow color={colors.mint} size={type.size.base} style={{ marginBottom: 4 }}>
          {active ? 'In progress' : 'Next up'}
        </Eyebrow>
        <h1 style={{ fontSize: type.size.title, fontWeight: type.weight.bold, lineHeight: 1.1 }}>
          {next.emoji} {next.name}
        </h1>
        <p style={{ color: colors.muted2, marginTop: 6, fontSize: type.size.lg }}>{next.tag}</p>
        <p style={{ color: colors.muted, marginTop: 6, fontSize: type.size.md }}>
          {lastWorkoutLabel(sessions)}
        </p>
      </div>

      {/* Exercise preview */}
      {next.exercises.length > 0 && (
        <div className="card" style={{ padding: 20, marginBottom: 20 }}>
          <Eyebrow size={type.size.sm} style={{ marginBottom: 12 }}>
            {next.exercises.length} exercises
          </Eyebrow>
          {next.exercises.map((ex, i) => (
            <div key={ex.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 0',
              borderBottom: i < next.exercises.length - 1 ? `1px solid ${colors.border}` : 'none'
            }}>
              <div>
                <p style={{ fontWeight: type.weight.semibold, fontSize: '0.9rem' }}>{ex.name}</p>
                {ex.alt && <p style={{ color: colors.muted2, fontSize: type.size.base }}>{ex.alt}</p>}
              </div>
              <p className="font-mono" style={{ color, fontSize: type.size.md, fontWeight: type.weight.bold, whiteSpace: 'nowrap', marginLeft: 12 }}>
                {ex.sets}×{ex.repsLow}–{ex.repsHigh}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Start button */}
      <StartOrResumeButton
        active={active}
        plan={next}
        color={color}
        starting={starting}
        onStart={startWorkout}
        onResume={() => active && nav(`/workout/${active.id}`)}
      />

      {/* Muscle groups */}
      <MuscleGroupPicker
        groups={groups}
        lastTrainedByDay={trainedByDay}
        activeSession={active}
        starting={starting}
        onStart={startDay}
      />

      {/* Last session */}
      {lastSession && lastPlan && (
        <div>
          <Eyebrow size={type.size.sm} style={{ marginBottom: 12 }}>
            Last session
          </Eyebrow>
          <div className="card" style={{ padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            onClick={() => nav('/history')}>
            <div>
              <p style={{ fontWeight: type.weight.semibold }}>{lastPlan.emoji} {lastPlan.name}</p>
              <p style={{ color: colors.muted, fontSize: type.size.md, marginTop: 2 }}>{lastSession.date}</p>
            </div>
            <span style={{ color: colors.muted, fontSize: '1.2rem' }}>›</span>
          </div>
        </div>
      )}

      {sessions.length === 0 && (
        <div className="card" style={{ padding: 24, textAlign: 'center' }}>
          <p style={{ color: colors.muted2, fontSize: type.size.lg }}>No sessions logged yet.</p>
          <p style={{ color: colors.muted, fontSize: type.size.md, marginTop: 4 }}>Start your first workout above 💪</p>
        </div>
      )}

      <button
        className="tap-target"
        onClick={async () => {
          try { await downloadExport() }
          catch { setToast('Export failed — is the backend up?'); setTimeout(() => setToast(null), 2500) }
        }}
        style={{ marginTop: 24, background: 'none', border: 'none', color: colors.muted2,
                 fontSize: type.size.md, textDecoration: 'underline', cursor: 'pointer' }}
      >
        Export my data
      </button>
      <VersionStamp />
    </div>
  )
}
