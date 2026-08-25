import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { PLAN, DAY_COLORS } from '../data/workoutPlan'
import TimerBar from '../components/TimerBar'
import ExerciseCuesModal from '../components/ExerciseCuesModal'
import Skeleton from '../components/Skeleton'
import { formatClock, elapsedSeconds, remainingSeconds } from '../lib/timer'
import { useWakeLock } from '../lib/useWakeLock'
import { useRestPreference } from '../lib/useRestPreference'
import { nextIncompleteExerciseId, prefillFor, nextSetNumber } from '../lib/workoutFlow'
import { overloadSuggestion } from '../lib/overload'
import { unlockAudio } from '../lib/sound'
import { loadRestTimer, saveRestTimer, clearRestTimer } from '../lib/restTimerStorage'
import { useActiveSession } from '../lib/activeSession'
import { track } from '../lib/analytics'
import Eyebrow from '../components/Eyebrow'
import Chip from '../components/Chip'
import DayAccent from '../components/DayAccent'
import DisclosureRow from '../components/DisclosureRow'
import Toast from '../components/Toast'
import { useToast } from '../lib/useToast'
import { colors, type, space } from '../lib/theme'

function Stat({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${colors.border}` }}>
      <span style={{ color: colors.muted2, fontSize: type.size.lg }}>{label}</span>
      <span className="font-mono" style={{ color: colors.text, fontWeight: type.weight.bold }}>{value}</span>
    </div>
  )
}

function SetRow({ s, onDelete }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '8px 0', borderBottom: `1px solid ${colors.border}`
    }}>
      <span style={{ color: colors.muted, fontSize: type.size.md, fontFamily: 'JetBrains Mono, monospace' }}>
        Set {s.set_number}
      </span>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <span className="font-mono" style={{ fontSize: '1rem', fontWeight: type.weight.bold, color: colors.text }}>
          {s.weight_kg}kg × {s.reps}
        </span>
        <button onClick={() => onDelete(s.id)} aria-label="delete set"
          style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer',
            fontSize: '1.1rem', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          ×
        </button>
      </div>
    </div>
  )
}

// Reaching a real working weight (e.g. 20kg -> 60kg) at a plain +2.5 step
// took 16 taps. Holding a stepper button now auto-repeats after a short
// delay, same as a native stepper, without changing the single-tap behavior.
const HOLD_DELAY_MS = 400
const HOLD_REPEAT_MS = 90

function NumControl({ value, onChange, step = 1, min = 0, mode = 'numeric' }) {
  const timers = useRef({ timeout: null, interval: null })
  const suppressClick = useRef(false)

  function bump(sign) {
    onChange(v => {
      const next = v + sign * step
      return sign < 0 ? Math.max(min, next) : next
    })
  }

  function startHold(sign) {
    timers.current.timeout = setTimeout(() => {
      suppressClick.current = true
      timers.current.interval = setInterval(() => bump(sign), HOLD_REPEAT_MS)
    }, HOLD_DELAY_MS)
  }

  function endHold() {
    clearTimeout(timers.current.timeout)
    clearInterval(timers.current.interval)
    timers.current.timeout = null
    timers.current.interval = null
  }

  // The click that follows a long-press-release must not also bump:
  // startHold already did the repeating for it.
  function handleClick(sign) {
    if (suppressClick.current) { suppressClick.current = false; return }
    bump(sign)
  }

  useEffect(() => () => endHold(), [])

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button className="btn-icon" aria-label="decrease"
        onPointerDown={() => startHold(-1)} onPointerUp={endHold} onPointerLeave={endHold} onPointerCancel={endHold}
        onClick={() => handleClick(-1)}>−</button>
      <input type="number" value={value} inputMode={mode}
        onChange={e => { const v = parseFloat(e.target.value); onChange(Number.isNaN(v) ? min : v) }}
        onBlur={e => { const v = parseFloat(e.target.value); onChange(Number.isNaN(v) ? min : Math.max(min, v)) }}
        style={{ width: 72, textAlign: 'center', background: colors.border, border: 'none', borderRadius: 8,
          color: colors.text, fontFamily: 'JetBrains Mono, monospace', fontSize: '1.25rem', fontWeight: type.weight.bold, padding: '8px 0' }} />
      <button className="btn-icon" aria-label="increase"
        onPointerDown={() => startHold(1)} onPointerUp={endHold} onPointerLeave={endHold} onPointerCancel={endHold}
        onClick={() => handleClick(1)}>+</button>
    </div>
  )
}

function WeightFieldLabel({ bodyweight }) {
  return (
    <div style={{ marginBottom: space.sm }}>
      <Eyebrow>{bodyweight ? 'Added Weight (kg)' : 'Weight (kg)'}</Eyebrow>
      {bodyweight && (
        <p style={{ color: colors.muted2, fontSize: '0.6rem', marginTop: 2 }}>0 = bodyweight only</p>
      )}
    </div>
  )
}

function prLabel(p) {
  const who = p.exercise_name ? `${p.exercise_name} ` : ''
  if (p.type === 'baseline') return `${p.exercise_name} — baseline set`
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
  const { toast, showToast } = useToast()
  const [expanded, setExpanded] = useState(null)
  const [weight, setWeight] = useState(20)
  const [reps, setReps] = useState(8)
  const [logging, setLogging] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [summary, setSummary] = useState(null)
  // restStartMs is an absolute timestamp, so restoring it on mount reproduces
  // whatever remainingSeconds() would show had this page never unmounted.
  // Navigating to Home/Progress/History and back no longer resets a running
  // rest timer to idle.
  const [restStartMs, setRestStartMs] = useState(() => loadRestTimer(sessionId)?.restStartMs ?? null)
  const [restTargetSec, setRestTargetSec] = useRestPreference(90)
  const [pausedRem, setPausedRem] = useState(() => loadRestTimer(sessionId)?.pausedRem ?? null)
  const { held: wakeLockHeld } = useWakeLock(true)
  const [lastPerf, setLastPerf] = useState({}) // exercise_id -> {sets,...} | null
  const [notes, setNotes] = useState({})
  const [editingNote, setEditingNote] = useState(null)
  const [cuesEx, setCuesEx] = useState(null) // exercise object shown in the cues bottom sheet, or null
  const cardRefs = useRef({}) // exercise_id -> card element, for auto-advance scroll

  async function ensureLastPerf(exId) {
    if (exId in lastPerf) return lastPerf[exId]
    try {
      const data = await api.get(`/exercises/${exId}/last?exclude_session=${sessionId}`)
      setLastPerf(prev => ({ ...prev, [exId]: data }))
      return data
    } catch { setLastPerf(prev => ({ ...prev, [exId]: null })); return null }
  }

  useEffect(() => {
    const prsPromise = Promise.all([
      api.get('/progress').catch(() => []),
      api.get('/personal-bests').catch(() => []),
    ]).then(([exercises, pbs]) => {
      const prMap = {}
      for (const ex of exercises) {
        // Progress has no reliable "reps at that max" — leave it unknown.
        if (ex.max_weight != null) prMap[ex.exercise_id] = { weight: ex.max_weight, reps: null }
      }
      for (const pb of pbs) {
        const cur = prMap[pb.exercise_id]
        // PB wins if higher — same winner-selection logic as before, now
        // carrying the PB's real reps along with the weight.
        if (cur == null || pb.weight_kg > cur.weight) {
          prMap[pb.exercise_id] = { weight: pb.weight_kg, reps: pb.reps }
        }
      }
      return prMap
    }).catch(() => ({}))

    api.get(`/sessions/${sessionId}`).then(async s => {
      setSession(s); setSets(s.sets || [])
      const prMap = await prsPromise
      prsAtStart.current = prMap
      setPrs(prMap)
      // An unrecognised workout_day must not throw here: the effect's .catch
      // would swallow it and bounce to Home, making the "Unknown workout day."
      // fallback below unreachable. No exercises means no first ID — the
      // fallback then renders as intended.
      const exercises = PLAN[s.workout_day]?.exercises || []
      const firstId = nextIncompleteExerciseId(exercises, s.sets || [])
      if (firstId) {
        setExpanded(firstId)
        const data = await ensureLastPerf(firstId)
        const firstEx = exercises.find(e => e.id === firstId)
        const pf = prefillFor(firstId, s.sets || [], prMap, data?.sets, { repsHigh: firstEx?.repsHigh, bodyweight: firstEx?.bodyweight })
        setWeight(pf.weight); setReps(pf.reps)
      }
    }).catch(() => nav('/'))
    // Load notes
    api.get('/notes').then(setNotes).catch(() => {})
  }, [sessionId])

  useEffect(() => {
    saveRestTimer(sessionId, { restStartMs, pausedRem })
  }, [sessionId, restStartMs, pausedRem])

  if (!session) return (
    <div style={{ paddingTop: 24 }}>
      <Skeleton height={32} width="60%" style={{ marginBottom: 16 }} />
      <Skeleton height={96} style={{ marginBottom: 12 }} />
      <Skeleton height={96} />
    </div>
  )

  if (summary) return (
    <div style={{ paddingTop: 24 }}>
      <h1 style={{ fontSize: type.size.title, fontWeight: type.weight.bold, marginBottom: 16 }}>Workout complete 🎉</h1>
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <Stat label="Duration" value={formatClock(summary.durSec)} />
        <Stat label="Sets" value={summary.totalSets} />
        <Stat label="Volume" value={`${summary.totalVolume.toLocaleString()} kg`} />
        <Stat label="Exercises" value={summary.exerciseCount} />
        {summary.serverPrs?.length > 0 && (
          <div style={{ marginTop: 12 }}>
            {summary.serverPrs.map((p, i) => {
              const isBaseline = p.type === 'baseline'
              return (
                <p key={i} style={{ color: isBaseline ? colors.muted : colors.amber, fontSize: type.size.md }}>
                  {isBaseline ? prLabel(p) : `🎉 New PR — ${prLabel(p)}`}
                </p>
              )
            })}
          </div>
        )}
      </div>
      <button className="btn-primary" onClick={() => nav('/')}>Done → Home</button>
    </div>
  )

  const plan = PLAN[session.workout_day]
  if (!plan) return <div style={{ padding: 24, color: colors.danger }}>Unknown workout day.</div>
  const color = DAY_COLORS[session.workout_day]

  const setsForExercise = (id) => sets.filter(s => s.exercise_id === id)

  async function logSet(ex) {
    if (logging) return
    // Must run synchronously in this click handler (before any await). The
    // rest-timer beep fires later from a setInterval, and mobile browsers
    // only let an AudioContext produce sound once it's unlocked by a gesture.
    unlockAudio()
    setLogging(true)
    const existingSets = setsForExercise(ex.id)
    try {
      const newSet = await api.post(`/sessions/${sessionId}/sets`, {
        exercise_id: ex.id,
        exercise_name: ex.name,
        set_number: nextSetNumber(existingSets),
        reps,
        weight_kg: weight
      })
      track('set_logged', { exercise_id: ex.id })
      const newSets = [...sets, newSet]
      setSets(newSets)
      // PR detection — null-safe: a completed max of 0kg (bodyweight work)
      // is a real record to beat, not "no record".
      const prevMax = prs[ex.id]?.weight
      if (prevMax == null || weight > prevMax) {
        setPrs(prev => ({ ...prev, [ex.id]: { weight, reps } }))
        if (prevMax != null) { // Only show if there was a previous record
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
          const nextEx = plan.exercises.find(e => e.id === nextId)
          const pf = prefillFor(nextId, newSets, prs, data?.sets, { repsHigh: nextEx?.repsHigh, bodyweight: nextEx?.bodyweight })
          setWeight(pf.weight); setReps(pf.reps)
          // Anchor the viewport to the newly-opened card so the collapse of
          // the tall finished card doesn't shift content under the thumb.
          requestAnimationFrame(() => {
            const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
            cardRefs.current[nextId]?.scrollIntoView({
              block: 'start', behavior: reduced ? 'auto' : 'smooth',
            })
          })
        }
      }
    } catch (e) { showToast('Failed to log set', 'error') }
    setLogging(false)
  }

  async function deleteSet(setId) {
    try {
      await api.delete(`/sessions/${sessionId}/sets/${setId}`)
      track('set_delete')
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
      track('session_finish', { session_id: sessionId })
      clearRestTimer(sessionId)
      refresh()
      const { summarize } = await import('../lib/sessionStats')
      let serverPrs = []
      try { serverPrs = await api.get(`/sessions/${sessionId}/prs`) } catch {}
      // summarize() expects exercise_id -> number (weight); prsAtStart.current
      // now holds { weight, reps } objects, so unwrap before handing it off.
      const prsBeforeWeights = Object.fromEntries(
        Object.entries(prsAtStart.current).map(([id, v]) => [id, v?.weight ?? v])
      )
      const stats = summarize(sets, prsBeforeWeights)
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
      <Toast toast={toast} />
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
        hasLoggedSets={sets.length > 0}
      />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <Eyebrow color={color} size={type.size.sm} style={{ marginBottom: 4 }}>
            Active session
          </Eyebrow>
          <h1 style={{ fontSize: type.size.title, fontWeight: type.weight.bold }}>{plan.emoji} {plan.name}</h1>
          <p style={{ color: colors.muted, fontSize: type.size.md, marginTop: 2 }}>{session.date}</p>
        </div>
      </div>

      {/* Exercises */}
      {plan.exercises.map(ex => {
        const exSets = setsForExercise(ex.id)
        const isOpen = expanded === ex.id
        const target = ex.sets
        const done = exSets.length
        const complete = done >= target

        return (
          <DisclosureRow key={ex.id} ref={el => { cardRefs.current[ex.id] = el }}
            style={{ marginBottom: space.md }} bodyPadding="16px"
            isOpen={isOpen}
            onToggle={async () => {
              const opening = !isOpen
              setExpanded(opening ? ex.id : null)
              if (opening) {
                const data = await ensureLastPerf(ex.id)
                const pf = prefillFor(ex.id, sets, prs, data?.sets, { repsHigh: ex.repsHigh, bodyweight: ex.bodyweight })
                setWeight(pf.weight); setReps(pf.reps)
              }
            }}
            header={
              <>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {/* Deliberately not type.size.title: that's the page <h1> (line ~396). This
                        is the per-card exercise name from the "title over cues link" hierarchy
                        fix (1e0d8f5) — it only needs to outrank the cues-link text within its own
                        card, not match the page heading. Tier-3 local literal per the design-tokens
                        spec's own precedent (not every value needs a token). */}
                    <span style={{ fontWeight: type.weight.bold, fontSize: '1.1rem' }}>{ex.name}</span>
                    {complete && <span style={{ color: colors.mint, fontSize: type.size.base }}>✓</span>}
                  </div>
                  <p style={{ color: colors.muted2, fontSize: type.size.base, marginTop: 2 }}>
                    {ex.alt} · {ex.sets}×{ex.repsLow}–{ex.repsHigh}
                  </p>
                </div>
                {/* Set dots */}
                <div style={{ display: 'flex', gap: 4 }}>
                  {Array.from({ length: target }).map((_, i) => (
                    i < done
                      ? <DayAccent key={i} day={session.workout_day} />
                      : <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: '#2a2a3e' }} />
                  ))}
                </div>
              </>
            }
          >
            {/* Info link: opens a bottom sheet in place, not a page nav, so
                checking a cue mid-set doesn't collapse this card or lose
                whatever weight/reps you've already dialed in. */}
            <button
              className="tap-target"
              onClick={() => setCuesEx(ex)}
              style={{ background: 'none', border: 'none', color: colors.muted, fontSize: type.size.base,
                fontWeight: 500, cursor: 'pointer', padding: 0, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 4 }}>
              📋 Form cues + demo
            </button>

            {/* Per-exercise note */}
            {editingNote === ex.id ? (
              <textarea defaultValue={notes[ex.id] || ''} autoFocus
                onBlur={e => saveNote(ex.id, e.target.value.trim())}
                style={{ width: '100%', background: colors.border, border: 'none', borderRadius: 8, color: colors.textSecondary, fontSize: type.size.md, padding: 8, resize: 'vertical' }} />
            ) : notes[ex.id] ? (
              <p onClick={() => setEditingNote(ex.id)} style={{ color: colors.muted, fontSize: type.size.base, fontStyle: 'italic', marginBottom: 10, cursor: 'text' }}>📝 {notes[ex.id]}</p>
            ) : (
              <button className="tap-target" onClick={() => setEditingNote(ex.id)} style={{ background: 'none', border: 'none', color: colors.muted, fontSize: type.size.sm, padding: 0, marginBottom: 10, cursor: 'pointer' }}>＋ Add note</button>
            )}

            {/* Last workout + overload hint */}
            {!(ex.id in lastPerf) && (
              <p style={{ color: colors.muted, fontSize: type.size.base, marginBottom: 12 }}>…</p>
            )}
            {lastPerf[ex.id] && lastPerf[ex.id].sets?.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <Eyebrow color={colors.muted} style={{ marginBottom: 4 }}>Last workout</Eyebrow>
                {lastPerf[ex.id].sets.map(s => (
                  <p key={s.set_number} className="font-mono" style={{ color: colors.muted, fontSize: type.size.md }}>{s.weight_kg}kg × {s.reps}</p>
                ))}
                {(() => {
                  const sug = overloadSuggestion(lastPerf[ex.id].sets, ex.repsHigh)
                  return sug ? (
                    <p style={{ color: colors.mint, fontSize: type.size.base, marginTop: 6 }}>
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
              {/* flex-wrap: the two fixed-width steppers exceed card width below ~380px;
                  Reps drops under Weight instead of clipping off-screen. */}
              <div style={{ display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap', rowGap: 14, marginBottom: 14 }}>
                <div style={{ textAlign: 'center' }}>
                  <WeightFieldLabel bodyweight={ex.bodyweight} />
                  <NumControl value={weight} onChange={setWeight} step={2.5} min={0} mode="decimal" />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <Eyebrow style={{ marginBottom: 8 }}>Reps</Eyebrow>
                  <NumControl value={reps} onChange={setReps} step={1} min={1} />
                </div>
              </div>
              <button className="btn-primary" onClick={() => logSet(ex)} disabled={logging}
                style={{ background: color, fontSize: '0.9rem', padding: '12px' }}>
                {logging ? 'Logging…' : `Log Set ${nextSetNumber(exSets)}`}
              </button>
            </div>

            {/* Muscles */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
              {ex.muscles.map(m => (
                <Chip key={m} color={colors.muted}>{m}</Chip>
              ))}
            </div>
          </DisclosureRow>
        )
      })}

      {/* Finish */}
      <button className="btn-primary" onClick={finishWorkout} disabled={finishing}
        style={{ marginTop: 16, background: color }}>
        {finishing ? 'Saving…' : '✓ Finish Workout'}
      </button>

      {cuesEx && (
        <ExerciseCuesModal ex={cuesEx} color={color} onClose={() => setCuesEx(null)} />
      )}
    </div>
  )
}
