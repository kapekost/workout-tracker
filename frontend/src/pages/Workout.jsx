import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { PLAN, DAY_COLORS } from '../data/workoutPlan'

function SetRow({ s, onDelete }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '8px 0', borderBottom: '1px solid #1e1e32'
    }}>
      <span style={{ color: '#6b7280', fontSize: '0.8rem', fontFamily: 'JetBrains Mono, monospace' }}>
        Set {s.set_number}
      </span>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <span className="font-mono" style={{ fontSize: '1rem', fontWeight: 700, color: '#fff' }}>
          {s.weight_kg}kg × {s.reps}
        </span>
        <button onClick={() => onDelete(s.id)}
          style={{ background: 'none', border: 'none', color: '#4a5568', cursor: 'pointer', fontSize: '1.1rem', padding: '0 4px' }}>
          ×
        </button>
      </div>
    </div>
  )
}

function NumControl({ value, onChange, step = 1, min = 0 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button className="btn-icon" onClick={() => onChange(Math.max(min, value - step))}>−</button>
      <input type="number" value={value} readOnly
        style={{ width: 72, textAlign: 'center', background: '#1e1e32', border: 'none', borderRadius: 8,
          color: '#fff', fontFamily: 'JetBrains Mono, monospace', fontSize: '1.25rem', fontWeight: 700, padding: '8px 0' }} />
      <button className="btn-icon" onClick={() => onChange(value + step)}>+</button>
    </div>
  )
}

export default function Workout() {
  const { sessionId } = useParams()
  const nav = useNavigate()
  const [session, setSession] = useState(null)
  const [sets, setSets] = useState([])
  const [prs, setPrs] = useState({})
  const [toast, setToast] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [weight, setWeight] = useState(20)
  const [reps, setReps] = useState(8)
  const [logging, setLogging] = useState(false)
  const [finishing, setFinishing] = useState(false)

  useEffect(() => {
    api.get(`/sessions/${sessionId}`).then(s => {
      setSession(s); setSets(s.sets || [])
    }).catch(() => nav('/'))
    // Load PRs
    api.get('/progress').then(async exercises => {
      const prMap = {}
      await Promise.all(exercises.map(async ex => {
        const prog = await api.get(`/progress/${ex.exercise_id}`)
        if (prog.length) prMap[ex.exercise_id] = Math.max(...prog.map(p => p.max_weight))
      }))
      setPrs(prMap)
    }).catch(() => {})
  }, [sessionId])

  if (!session) return <div style={{ paddingTop: 80, textAlign: 'center', color: '#4a5568' }}>Loading…</div>

  const plan = PLAN[session.workout_day]
  if (!plan) return <div style={{ padding: 24, color: '#ef4444' }}>Unknown workout day.</div>
  const color = DAY_COLORS[session.workout_day]

  const setsForExercise = (id) => sets.filter(s => s.exercise_id === id)

  async function logSet(ex) {
    if (logging) return
    setLogging(true)
    const existingSets = setsForExercise(ex.id)
    try {
      const newSet = await api.post(`/sessions/${sessionId}/sets`, {
        exercise_id: ex.id,
        exercise_name: ex.name,
        set_number: existingSets.length + 1,
        reps,
        weight_kg: weight
      })
      setSets(prev => [...prev, newSet])
      // PR detection
      if (!prs[ex.id] || weight > prs[ex.id]) {
        setPrs(prev => ({ ...prev, [ex.id]: weight }))
        if (prs[ex.id]) { // Only show if there was a previous record
          showToast(`🏆 PR! ${weight}kg on ${ex.name}`)
        }
      }
    } catch (e) { alert('Failed to log set.') }
    setLogging(false)
  }

  async function deleteSet(setId) {
    try {
      await api.delete(`/sessions/${sessionId}/sets/${setId}`)
      setSets(prev => prev.filter(s => s.id !== setId))
    } catch (e) { alert('Failed to delete set.') }
  }

  async function finishWorkout() {
    if (finishing) return
    setFinishing(true)
    try {
      await api.patch(`/sessions/${sessionId}`, { completed: true })
      nav('/')
    } catch (e) {
      alert('Failed to finish session.')
      setFinishing(false)
    }
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  return (
    <div style={{ paddingTop: 24 }}>
      {toast && <div className="toast">{toast}</div>}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <p style={{ color, fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
            Active session
          </p>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700 }}>{plan.emoji} {plan.name}</h1>
          <p style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: 2 }}>{session.date}</p>
        </div>
        <button className="btn-secondary" onClick={finishWorkout} disabled={finishing}
          style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
          {finishing ? '…' : 'Finish ✓'}
        </button>
      </div>

      {/* Exercises */}
      {plan.exercises.map(ex => {
        const exSets = setsForExercise(ex.id)
        const isOpen = expanded === ex.id
        const target = ex.sets
        const done = exSets.length
        const complete = done >= target

        return (
          <div key={ex.id} className="card" style={{ marginBottom: 12, overflow: 'hidden' }}>
            {/* Exercise header */}
            <div style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              onClick={() => setExpanded(isOpen ? null : ex.id)}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{ex.name}</span>
                  {complete && <span style={{ color: '#6ee7b7', fontSize: '0.75rem' }}>✓</span>}
                </div>
                <p style={{ color: '#6b7280', fontSize: '0.75rem', marginTop: 2 }}>
                  {ex.alt} · {ex.sets}×{ex.repsLow}–{ex.repsHigh}
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {/* Set dots */}
                <div style={{ display: 'flex', gap: 4 }}>
                  {Array.from({ length: target }).map((_, i) => (
                    <div key={i} style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: i < done ? color : '#2a2a3e'
                    }} />
                  ))}
                </div>
                <span style={{ color: '#4a5568', fontSize: '1.1rem' }}>{isOpen ? '∧' : '∨'}</span>
              </div>
            </div>

            {/* Expanded — set logger */}
            {isOpen && (
              <div style={{ borderTop: '1px solid #1e1e32', padding: '16px' }}>
                {/* Info link */}
                <button
                  onClick={() => nav(`/exercise/${session.workout_day}/${ex.id}`)}
                  style={{ background: 'none', border: 'none', color: '#6ee7b7', fontSize: '0.75rem',
                    fontWeight: 600, cursor: 'pointer', padding: 0, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 4 }}>
                  📋 Form cues + demo →
                </button>

                {/* Logged sets */}
                {exSets.map(s => (
                  <SetRow key={s.id} s={s} onDelete={deleteSet} />
                ))}

                {/* Logger controls */}
                <div style={{ marginTop: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: 14 }}>
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ color: '#6b7280', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Weight (kg)</p>
                      <NumControl value={weight} onChange={setWeight} step={2.5} min={0} />
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ color: '#6b7280', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Reps</p>
                      <NumControl value={reps} onChange={setReps} step={1} min={1} />
                    </div>
                  </div>
                  <button className="btn-primary" onClick={() => logSet(ex)} disabled={logging}
                    style={{ background: color, fontSize: '0.9rem', padding: '12px' }}>
                    {logging ? 'Logging…' : `Log Set ${exSets.length + 1}`}
                  </button>
                </div>

                {/* Muscles */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                  {ex.muscles.map(m => (
                    <span key={m} style={{
                      background: '#1e1e32', borderRadius: 100, padding: '3px 10px',
                      fontSize: '0.7rem', color: '#9ca3af', fontWeight: 500
                    }}>{m}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* Finish */}
      <button className="btn-primary" onClick={finishWorkout} disabled={finishing}
        style={{ marginTop: 16, background: color }}>
        {finishing ? 'Saving…' : '✓ Finish Workout'}
      </button>
    </div>
  )
}
