import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { PLAN, DAY_COLORS } from '../data/workoutPlan'
import TimerBar from '../components/TimerBar'
import Skeleton from '../components/Skeleton'
import { formatClock, elapsedSeconds, remainingSeconds } from '../lib/timer'
import { useWakeLock } from '../lib/useWakeLock'
import { useRestPreference } from '../lib/useRestPreference'
import { nextIncompleteExerciseId, prefillFor } from '../lib/workoutFlow'
import { overloadSuggestion } from '../lib/overload'
import { useActiveSession } from '../lib/activeSession'

function Stat({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #1e1e32' }}>
      <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>{label}</span>
      <span className="font-mono" style={{ color: '#fff', fontWeight: 700 }}>{value}</span>
    </div>
  )
}

function SetRow({ s, onDelete }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '8px 0', borderBottom: '1px solid #1e1e32'
    }}>
      <span style={{ color: '#9ca3af', fontSize: '0.8rem', fontFamily: 'JetBrains Mono, monospace' }}>
        Set {s.set_number}
      </span>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <span className="font-mono" style={{ fontSize: '1rem', fontWeight: 700, color: '#fff' }}>
          {s.weight_kg}kg × {s.reps}
        </span>
        <button onClick={() => onDelete(s.id)} aria-label="delete set"
          style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer',
            fontSize: '1.1rem', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          ×
        </button>
      </div>
    </div>
  )
}

function NumControl({ value, onChange, step = 1, min = 0, mode = 'numeric' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button className="btn-icon" aria-label="decrease" onClick={() => onChange(Math.max(min, value - step))}>−</button>
      <input type="number" value={value} inputMode={mode}
        onChange={e => { const v = parseFloat(e.target.value); onChange(Number.isNaN(v) ? min : v) }}
        onBlur={e => { const v = parseFloat(e.target.value); onChange(Number.isNaN(v) ? min : Math.max(min, v)) }}
        style={{ width: 72, textAlign: 'center', background: '#1e1e32', border: 'none', borderRadius: 8,
          color: '#fff', fontFamily: 'JetBrains Mono, monospace', fontSize: '1.25rem', fontWeight: 700, padding: '8px 0' }} />
      <button className="btn-icon" aria-label="increase" onClick={() => onChange(value + step)}>+</button>
    </div>
  )
}

function prLabel(p) {
  const who = p.exercise_name ? `${p.exercise_name} ` : ''
  if (p.type === 'weight')  return `Highest ${who}weight: ${p.value}kg`
  if (p.type === 'reps')    return `Most ${who}reps ${p.unit}: ${p.value}`
  if (p.type === '1rm')     return `Highest ${who}est. 1RM: ${p.value}kg`
  if (p.type === 'volume')  return `Highest session volume: ${p.value.toLocaleString()}kg`
  return 'New record'
}

export default function Workout() {
  const { sessionId } = useParams()
  const nav = useNavigate()
  const { refresh } = useActiveSession()
  const [session, setSession] = useState(null)
  const [sets, setSets] = useState([])
  const [prs, setPrs] = useState({})
  const prsAtStart = useRef({})
  const [toast, setToast] = useState(null) // { msg, type }
  const [expanded, setExpanded] = useState(null)
  const [weight, setWeight] = useState(20)
  const [reps, setReps] = useState(8)
  const [logging, setLogging] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [summary, setSummary] = useState(null)
  const [restStartMs, setRestStartMs] = useState(null)
  const [restTargetSec, setRestTargetSec] = useRestPreference(90)
  const [pausedRem, setPausedRem] = useState(null)
  const { held: wakeLockHeld } = useWakeLock(true)
  const [lastPerf, setLastPerf] = useState({}) // exercise_id -> {sets,...} | null
  const [notes, setNotes] = useState({})
  const [editingNote, setEditingNote] = useState(null)

  async function ensureLastPerf(exId) {
    if (exId in lastPerf) return lastPerf[exId]
    try {
      const data = await api.get(`/exercises/${exId}/last?exclude_session=${sessionId}`)
      setLastPerf(prev => ({ ...prev, [exId]: data }))
      return data
    } catch { setLastPerf(prev => ({ ...prev, [exId]: null })); return null }
  }

  useEffect(() => {
    api.get(`/sessions/${sessionId}`).then(async s => {
      setSession(s); setSets(s.sets || [])
      const firstId = nextIncompleteExerciseId(PLAN[s.workout_day].exercises, s.sets || [])
      if (firstId) {
        setExpanded(firstId)
        const data = await ensureLastPerf(firstId)
        const pf = prefillFor(firstId, s.sets || [], {}, data?.sets)
        setWeight(pf.weight); setReps(pf.reps)
      }
    }).catch(() => nav('/'))
    // Load notes
    api.get('/notes').then(setNotes).catch(() => {})
    // Load PRs
    api.get('/progress').then(async exercises => {
      const prMap = {}
      await Promise.all(exercises.map(async ex => {
        const prog = await api.get(`/progress/${ex.exercise_id}`)
        if (prog.length) prMap[ex.exercise_id] = Math.max(...prog.map(p => p.max_weight))
      }))
      prsAtStart.current = prMap
      setPrs(prMap)
    }).catch(() => {})
  }, [sessionId])

  if (!session) return (
    <div style={{ paddingTop: 24 }}>
      <Skeleton height={32} width="60%" style={{ marginBottom: 16 }} />
      <Skeleton height={96} style={{ marginBottom: 12 }} />
      <Skeleton height={96} />
    </div>
  )

  if (summary) return (
    <div style={{ paddingTop: 24 }}>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 700, marginBottom: 16 }}>Workout complete 🎉</h1>
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <Stat label="Duration" value={formatClock(summary.durSec)} />
        <Stat label="Sets" value={summary.totalSets} />
        <Stat label="Volume" value={`${summary.totalVolume.toLocaleString()} kg`} />
        <Stat label="Exercises" value={summary.exerciseCount} />
        {summary.serverPrs?.length > 0 && (
          <div style={{ marginTop: 12 }}>
            {summary.serverPrs.map((p, i) => (
              <p key={i} style={{ color: '#fbbf24', fontSize: '0.8rem' }}>
                🎉 New PR — {prLabel(p)}
              </p>
            ))}
          </div>
        )}
      </div>
      <button className="btn-primary" onClick={() => nav('/')}>Done → Home</button>
    </div>
  )

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
      const newSets = [...sets, newSet]
      setSets(newSets)
      // PR detection
      if (!prs[ex.id] || weight > prs[ex.id]) {
        setPrs(prev => ({ ...prev, [ex.id]: weight }))
        if (prs[ex.id]) { // Only show if there was a previous record
          showToast(`🏆 PR! ${weight}kg on ${ex.name}`)
        }
      }
      setRestStartMs(Date.now())
      setPausedRem(null)
      // auto-advance when this exercise reached its target
      const doneForEx = newSets.filter(s => s.exercise_id === ex.id).length
      if (doneForEx >= ex.sets) {
        const nextId = nextIncompleteExerciseId(plan.exercises, newSets)
        if (nextId && nextId !== ex.id) {
          setExpanded(nextId)
          const data = await ensureLastPerf(nextId)
          const pf = prefillFor(nextId, newSets, prs, data?.sets)
          setWeight(pf.weight); setReps(pf.reps)
        }
      }
    } catch (e) { showToast('Failed to log set', 'error') }
    setLogging(false)
  }

  async function deleteSet(setId) {
    try {
      await api.delete(`/sessions/${sessionId}/sets/${setId}`)
      setSets(prev => prev.filter(s => s.id !== setId))
    } catch (e) { showToast('Failed to delete set', 'error') }
  }

  async function saveNote(exId, text) {
    setNotes(prev => ({ ...prev, [exId]: text }))
    setEditingNote(null)
    try { await api.put(`/exercises/${exId}/note`, { note: text }) }
    catch { showToast('Failed to save note', 'error') }
  }

  async function finishWorkout() {
    if (finishing) return
    setFinishing(true)
    try {
      const updated = await api.patch(`/sessions/${sessionId}`, { completed: true })
      refresh()
      const { summarize } = await import('../lib/sessionStats')
      let serverPrs = []
      try { serverPrs = await api.get(`/sessions/${sessionId}/prs`) } catch {}
      const stats = summarize(sets, prsAtStart.current)
      const durSec = updated.ended_at && session.created_at
        ? Math.max(0, Math.round(
            (Date.parse(updated.ended_at.replace(' ', 'T') + 'Z') -
             Date.parse(session.created_at.replace(' ', 'T') + 'Z')) / 1000))
        : elapsedSeconds(sessionStartMs, Date.now())
      setSummary({ ...stats, durSec, serverPrs })
    } catch (e) {
      showToast('Failed to finish session', 'error')
      setFinishing(false)
    }
  }

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2500)
  }

  function togglePause() {
    if (pausedRem == null) {
      const rem = remainingSeconds(restStartMs, restTargetSec, Date.now())
      setPausedRem(rem); setRestStartMs(null)
    } else {
      setRestStartMs(Date.now() - (restTargetSec - pausedRem) * 1000)
      setPausedRem(null)
    }
  }

  const sessionStartMs = session.created_at
    ? Date.parse(session.created_at.replace(' ', 'T') + 'Z')
    : Date.now()

  return (
    <div style={{ paddingTop: 16, paddingBottom: 96 }}>
      {toast && <div className={`toast${toast.type === 'error' ? ' error' : ''}`}>{toast.msg}</div>}
      <TimerBar
        sessionStartMs={sessionStartMs}
        restStartMs={restStartMs}
        restTargetSec={restTargetSec}
        onAddRest={(d) => setRestTargetSec(t => Math.max(0, t + d))}
        onSkipRest={() => { setRestStartMs(null); setPausedRem(null) }}
        color={color}
        wakeLockHeld={wakeLockHeld}
        paused={pausedRem != null}
        pausedRem={pausedRem}
        onTogglePause={togglePause}
      />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <p style={{ color, fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
            Active session
          </p>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700 }}>{plan.emoji} {plan.name}</h1>
          <p style={{ color: '#9ca3af', fontSize: '0.8rem', marginTop: 2 }}>{session.date}</p>
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
              onClick={async () => {
                const opening = !isOpen
                setExpanded(opening ? ex.id : null)
                if (opening) {
                  const data = await ensureLastPerf(ex.id)
                  const pf = prefillFor(ex.id, sets, prs, data?.sets)
                  setWeight(pf.weight); setReps(pf.reps)
                }
              }}>
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
                <span style={{ color: '#9ca3af', fontSize: '1.1rem' }}>{isOpen ? '∧' : '∨'}</span>
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

                {/* Per-exercise note */}
                {editingNote === ex.id ? (
                  <textarea defaultValue={notes[ex.id] || ''} autoFocus
                    onBlur={e => saveNote(ex.id, e.target.value.trim())}
                    style={{ width: '100%', background: '#1e1e32', border: 'none', borderRadius: 8, color: '#e2e8f0', fontSize: '0.8rem', padding: 8, resize: 'vertical' }} />
                ) : notes[ex.id] ? (
                  <p onClick={() => setEditingNote(ex.id)} style={{ color: '#9ca3af', fontSize: '0.78rem', fontStyle: 'italic', marginBottom: 10, cursor: 'text' }}>📝 {notes[ex.id]}</p>
                ) : (
                  <button onClick={() => setEditingNote(ex.id)} style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: '0.72rem', padding: 0, marginBottom: 10, cursor: 'pointer' }}>＋ Add note</button>
                )}

                {/* Last workout + overload hint */}
                {!(ex.id in lastPerf) && (
                  <p style={{ color: '#9ca3af', fontSize: '0.75rem', marginBottom: 12 }}>…</p>
                )}
                {lastPerf[ex.id] && lastPerf[ex.id].sets?.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <p style={{ color: '#9ca3af', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>Last workout</p>
                    {lastPerf[ex.id].sets.map(s => (
                      <p key={s.set_number} className="font-mono" style={{ color: '#9ca3af', fontSize: '0.8rem' }}>{s.weight_kg}kg × {s.reps}</p>
                    ))}
                    {(() => {
                      const sug = overloadSuggestion(lastPerf[ex.id].sets, ex.repsHigh)
                      return sug ? (
                        <p style={{ color: '#6ee7b7', fontSize: '0.75rem', marginTop: 6 }}>
                          Suggested <strong>{sug.weight}kg</strong> · Target {ex.repsLow}–{ex.repsHigh}
                        </p>
                      ) : null
                    })()}
                  </div>
                )}

                {/* Logged sets */}
                {exSets.map(s => (
                  <SetRow key={s.id} s={s} onDelete={deleteSet} />
                ))}

                {/* Logger controls */}
                <div style={{ marginTop: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: 14 }}>
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ color: '#6b7280', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Weight (kg)</p>
                      <NumControl value={weight} onChange={setWeight} step={2.5} min={0} mode="decimal" />
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
