import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { DAY_COLORS } from '../data/workoutPlan'
import { usePlan } from '../lib/planContext'
import TimerBar from '../components/TimerBar'
import SessionClock from '../components/SessionClock'
import ExerciseCuesModal from '../components/ExerciseCuesModal'
import Skeleton from '../components/Skeleton'
import { formatClock, elapsedSeconds, remainingSeconds } from '../lib/timer'
import { useWakeLock } from '../lib/useWakeLock'
import { useRestPreference } from '../lib/useRestPreference'
import { useConfirmWindow } from '../lib/useConfirmWindow'
import { nextIncompleteExerciseId, prefillFor, nextSetNumber } from '../lib/workoutFlow'
import { overloadSuggestion } from '../lib/overload'
import { unlockAudio } from '../lib/sound'
import { loadRestTimer, saveRestTimer, clearRestTimer } from '../lib/restTimerStorage'
import { useActiveSession } from '../lib/activeSession'
import { track } from '../lib/analytics'
import Eyebrow from '../components/Eyebrow'
import Chip from '../components/Chip'
import DayAccent from '../components/DayAccent'
import DayIcon from '../components/DayIcon'
import DisclosureRow from '../components/DisclosureRow'
import Toast from '../components/Toast'
import { useToast } from '../lib/useToast'
import { colors, type, space, icon } from '../lib/theme'
import { IconCheck, IconTrash, IconMinus, IconPlus, IconSparkles, IconTrophy, IconClipboardDocumentList, IconPencil } from '../icons'

function Stat({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${colors.border}` }}>
      <span style={{ color: colors.muted2, fontSize: type.size.lg }}>{label}</span>
      <span className="font-mono" style={{ color: colors.text, fontWeight: type.weight.bold }}>{value}</span>
    </div>
  )
}

// The only destructive action performed mid-workout, with sweaty hands, right
// next to the numbers you just read — and the only one in the app with no
// confirm. Reuses the tap-again-to-confirm pattern History.jsx and
// PersonalBests.jsx already use (armed state + a 3s window), rather than
// inventing a second pattern for the same idea.
function SetRow({ s, armed, onRequestDelete }) {
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
        <button onClick={() => onRequestDelete(s.id)}
          aria-label={armed ? `confirm delete set ${s.set_number}` : `delete set ${s.set_number}`}
          style={{ background: 'none', border: 'none', cursor: 'pointer',
            color: armed ? colors.danger : colors.muted,
            fontSize: armed ? type.size.base : type.size.strong, fontWeight: armed ? type.weight.bold : type.weight.regular,
            width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {armed ? <IconCheck size={icon.control} /> : <IconTrash size={icon.control} />}
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

// This page is the only one with both TimerBar and NavBar fixed at the
// bottom simultaneously. .page-shell's own 96px trailing pad (App.jsx) is
// already sized to clear NavBar (a measured, constant 77px across every
// viewport width) plus a small margin - the same clearance every other
// page gets. On top of that this page also needs TimerBar's own rendered
// height so the last card never ends up hidden behind it.
// #229 Task 5: TimerBar dropped the session-clock row (moved to
// SessionClock, in the header above), so it no longer has the old two-tier
// 65px/69px height split driven by .rest-clock's breakpoint font steps -- it
// now measures a flat 65px at every width (re-verified in a real browser,
// 320/360/390/440px, via a mocked-API Playwright script). 69 covers it with
// a few px to spare, same margin the original 70 gave the old 69px tier.
// Verified in a real browser (2026-08-25, Upgrade 5 Task 3/I14, back when
// Finish Workout was this page's last element rather than in the header):
// relying on .page-shell's 96px alone left it ~25px behind TimerBar's top
// edge at every width tested (320-600px) - genuinely load-bearing, not
// redundant. This replaces the old bare "96" (a second, coincidental copy
// of .page-shell's own number) with the value actually required, leaving
// ~20-30px of clearance instead of ~70-90px of dead space.
const EXTRA_BOTTOM_CLEARANCE_FOR_TIMER_BAR = 69

function NumControl({ value, onChange, step = 1, min = 0, mode = 'numeric', label = 'value' }) {
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

  // 2026-10-03 design review 1.5: while the field has focus it holds the raw
  // string the user typed, not a parsed number. The old handler did
  // `onChange(Number.isNaN(v) ? min : v)`, so deleting the contents wrote the
  // minimum straight back and the caret ended up after that digit — the next
  // keystroke appended to it. Clearing "8" and typing "5" logged 15.
  const [draft, setDraft] = useState(value == null ? '' : String(value))
  const [editing, setEditing] = useState(false)
  useEffect(() => { if (!editing) setDraft(value == null ? '' : String(value)) }, [value, editing])

  function commit(raw) {
    setEditing(false)
    const v = parseFloat(raw)
    onChange(Number.isNaN(v) ? min : Math.max(min, v))
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button className="btn-icon" aria-label={`decrease ${label}`}
        onPointerDown={() => startHold(-1)} onPointerUp={endHold} onPointerLeave={endHold} onPointerCancel={endHold}
        onClick={() => handleClick(-1)}><IconMinus size={icon.control} /></button>
      {/* The type-a-number escape hatch is the *fast path* (type "60" instead of
          16 stepper taps), so it being the smallest target on screen was backwards.
          minHeight brings it to the same 44px floor every button on this page holds;
          aria-label gives it an accessible name at all — previously it had none, and
          a screen reader heard "decrease, increase, decrease, increase" with no way
          to tell weight from reps. */}
      <input type="number" value={draft} inputMode={mode} aria-label={label}
        onFocus={() => setEditing(true)}
        onChange={e => {
          const raw = e.target.value
          setEditing(true)
          setDraft(raw)
          // Commit every *valid* keystroke so the parent stays in sync (a
          // subsequent Log Set must use what is on screen without waiting
          // for a blur). Empty is the one transient state we refuse to
          // write back — that refusal is the whole fix.
          const v = parseFloat(raw)
          if (!Number.isNaN(v)) onChange(Math.max(min, v))
        }}
        onBlur={e => commit(e.target.value)}
        style={{ width: 72, minHeight: 44, boxSizing: 'border-box', textAlign: 'center', background: colors.border, border: 'none', borderRadius: 8,
          color: colors.text, fontFamily: 'JetBrains Mono, monospace', fontSize: '1.25rem', fontWeight: type.weight.bold, padding: '10px 0' }} />
      <button className="btn-icon" aria-label={`increase ${label}`}
        onPointerDown={() => startHold(1)} onPointerUp={endHold} onPointerLeave={endHold} onPointerCancel={endHold}
        onClick={() => handleClick(1)}><IconPlus size={icon.control} /></button>
    </div>
  )
}

function WeightFieldLabel({ bodyweight }) {
  return (
    <div style={{ marginBottom: space.sm }}>
      <Eyebrow>{bodyweight ? 'Added Weight (kg)' : 'Weight (kg)'}</Eyebrow>
      {bodyweight && (
        // type.size.sm, not the 0.6rem this used to be. That was below the scale
        // floor, on the app's most safety-relevant micro-copy: 0 means
        // bodyweight, not a broken field. Read mid-set.
        <p style={{ color: colors.muted2, fontSize: type.size.sm, marginTop: 2 }}>0 = bodyweight only</p>
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
  const { plan: PLAN } = usePlan()
  const [session, setSession] = useState(null)
  const [loadError, setLoadError] = useState(false)
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
  // Which note is open, and what has been typed into it so far — one object
  // rather than an exercise id plus a separate draft. Wave 1.3: the draft has to
  // survive a failed save, and the old shape could not express that. `text` is
  // live, so a controlled textarea is the only thing that can re-seed the editor
  // with the user's own words after a failure (defaultValue cannot: it only
  // reads on mount).
  const [noteEditing, setNoteEditing] = useState(null) // { exId, text } | null
  const [noteFailed, setNoteFailed] = useState({})    // exId -> true
  const [cuesEx, setCuesEx] = useState(null) // exercise object shown in the cues bottom sheet, or null
  const cardRefs = useRef({}) // exercise_id -> card element, for auto-advance scroll
  // Same tap-again-to-confirm shape as History.jsx's confirmId and
  // PersonalBests.jsx's confirmId: only one set can be armed at a time, and
  // arming one disarms whatever was armed before it.
  const { armedId: confirmSetId, confirm: confirmDeleteSet } = useConfirmWindow()

  async function ensureLastPerf(ex) {
    if (ex.id in lastPerf) return lastPerf[ex.id]
    try {
      const data = await api.get(
        `/exercises/${ex.id}/last?exclude_session=${sessionId}` +
        `&reps_low=${ex.repsLow}&reps_high=${ex.repsHigh}&bodyweight=${!!ex.bodyweight}`)
      setLastPerf(prev => ({ ...prev, [ex.id]: data }))
      return data
    } catch { setLastPerf(prev => ({ ...prev, [ex.id]: null })); return null }
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
      // would swallow it and bounce to Home, making the "Couldn't find this
      // workout." fallback below unreachable. No exercises means no first
      // ID — the fallback then renders as intended.
      const exercises = PLAN[s.workout_day]?.exercises || []
      const firstId = nextIncompleteExerciseId(exercises, s.sets || [])
      if (firstId) {
        setExpanded(firstId)
        const firstEx = exercises.find(e => e.id === firstId)
        const data = await ensureLastPerf(firstEx)
        const pf = prefillFor(firstId, s.sets || [], prMap, data, { repsHigh: firstEx?.repsHigh, bodyweight: firstEx?.bodyweight })
        setWeight(pf.weight); setReps(pf.reps)
      }
    // A failed read must NOT navigate. `.catch(() => nav('/'))` threw the user
    // out of their own live workout and landed on Home, which then said "No
    // sessions logged yet" and offered to start a different day (Wave 1.1).
    // This is the only one of the six read-failure sites that destroyed
    // navigation context rather than merely mislabelling a state.
    }).catch(() => setLoadError(true))
    // Load notes
    api.get('/notes').then(setNotes).catch(() => {})
  }, [sessionId])

  useEffect(() => {
    saveRestTimer(sessionId, { restStartMs, pausedRem })
  }, [sessionId, restStartMs, pausedRem])

  if (loadError) return (
    <div style={{ paddingTop: 24 }}>
      <Eyebrow color={colors.danger} size={type.size.base} style={{ marginBottom: 4 }}>
        Couldn't load
      </Eyebrow>
      <h1 style={{ fontSize: type.size.title, fontWeight: type.weight.bold, letterSpacing: type.letterSpacing.tight, marginBottom: 16 }}>
        Check your connection
      </h1>
      <div className="form-error">
        We couldn't open this workout. Your sets are safe — nothing was logged or lost.
      </div>
      <button className="btn-secondary" style={{ marginTop: 16 }} onClick={() => window.location.reload()}>
        Try again
      </button>
    </div>
  )

  if (!session) return (
    <div style={{ paddingTop: 24 }}>
      <Skeleton height={32} width="60%" style={{ marginBottom: 16 }} />
      <Skeleton height={96} style={{ marginBottom: 12 }} />
      <Skeleton height={96} />
    </div>
  )

  if (summary) return (
    <div style={{ paddingTop: 24 }}>
      <h1 style={{ fontSize: type.size.title, fontWeight: type.weight.bold, letterSpacing: type.letterSpacing.tight, marginBottom: 16 }}>Workout complete <IconSparkles size={icon.heading} style={{ verticalAlign: 'middle' }} /></h1>
      <div className="card" style={{ padding: space.xxl, marginBottom: 16 }}>
        <Stat label="Duration" value={formatClock(summary.durSec)} />
        <Stat label="Sets" value={summary.totalSets} />
        <Stat label="Volume" value={`${summary.totalVolume.toLocaleString()} kg`} />
        <Stat label="Exercises" value={summary.exerciseCount} />
        {summary.serverPrs?.length > 0 && (
          <div style={{ marginTop: 12 }}>
            {summary.serverPrs.map((p, i) => {
              const isBaseline = p.type === 'baseline'
              return (
                <p key={i} style={{ color: isBaseline ? colors.muted : colors.success, fontSize: type.size.md }}>
                  {isBaseline ? prLabel(p) : <><IconSparkles size={icon.body} /> New PR — {prLabel(p)}</>}
                </p>
              )
            })}
          </div>
        )}
      </div>
      <button className="btn-primary" onClick={() => nav('/')}>Done</button>
    </div>
  )

  const plan = PLAN[session.workout_day]
  if (!plan) return <div style={{ padding: 24, color: colors.danger }}>Couldn't find this workout.</div>
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
          showToast(<><IconTrophy size={icon.body} /> PR! {weight}kg on {ex.name}</>)
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
          const nextEx = plan.exercises.find(e => e.id === nextId)
          const data = await ensureLastPerf(nextEx)
          const pf = prefillFor(nextId, newSets, prs, data, { repsHigh: nextEx?.repsHigh, bodyweight: nextEx?.bodyweight })
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
    } catch (e) {
      // Wave 1.6: one message for every failure told the user to "tap Log Set
      // again" for a 422, which can never succeed on retry — the backend
      // rejects reps < 1 and weight_kg < 0 or > 1000 (main.py:343-345), and the
      // reps stepper moves in steps of 1, so a fractional value was not even
      // reachable by stepping. The message demanded the impossible.
      //
      // `err.status` already exists (api.js). Branching on it:
      //   401       — api.js is already routing this to the logout handler;
      //               the screen is being torn down, so a toast is noise.
      //   4xx       — the server rejected the request. Retrying changes nothing.
      //   no status — network drop or the 8s abort. The write may or may not
      //               have landed, which is why this branch keeps the retry
      //               hint AND points at the set list to check first.
      if (e?.status === 401) {
        // api.js is already routing this to the logout handler and the screen
        // is being torn down; a toast racing the redirect is noise. Falls
        // through to setLogging(false) like every other branch.
      } else if (e?.status === 422) {
        showToast('That value is not allowed — check weight and reps', 'error')
      } else if (e?.status >= 400 && e?.status < 500) {
        showToast("Couldn't save that set — the server rejected it", 'error')
      } else {
        showToast("Couldn't save that set — check the sets above, then tap Log Set again", 'error')
      }
    }
    setLogging(false)
  }

  async function deleteSet(setId) {
    try {
      await api.delete(`/sessions/${sessionId}/sets/${setId}`)
      track('set_delete')
      setSets(prev => prev.filter(s => s.id !== setId))
    } catch (e) { showToast('Failed to delete set', 'error') }
  }

  // First tap on × arms it and starts a 3s window; a second tap inside that
  // window is the confirm and actually deletes. Anything else — arming a
  // different set, or the window elapsing — disarms it.
  function requestDeleteSet(setId) {
    if (confirmDeleteSet(setId)) deleteSet(setId)
  }

  async function saveNote(exId, text) {
    setNotes(prev => ({ ...prev, [exId]: text }))
    try {
      await api.put(`/exercises/${exId}/note`, { note: text })
      setNoteEditing(null)
      setNoteFailed(prev => { const next = { ...prev }; delete next[exId]; return next })
    } catch {
      // The editor deliberately STAYS OPEN, holding the text. The old code
      // closed it before the await, so a failed save destroyed what the user
      // had typed — the data loss here was never the missing row, it was the
      // words, and they were being thrown away one line above this catch.
      // Leaving it open and controlled is also the retry: fix the connection,
      // tap away again.
      setNoteFailed(prev => ({ ...prev, [exId]: true }))
      showToast('Note not saved — still here, tap to retry', 'error')
    }
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
    <div style={{ paddingTop: 16, paddingBottom: EXTRA_BOTTOM_CLEARANCE_FOR_TIMER_BAR }}>
      <Toast toast={toast} />
      <TimerBar
        restStartMs={restStartMs}
        restTargetSec={restTargetSec}
        onAddRest={(d) => setRestTargetSec(t => Math.max(0, t + d))}
        onSkipRest={() => { setRestStartMs(null); setPausedRem(null) }}
        color={color}
        paused={pausedRem != null}
        pausedRem={pausedRem}
        onTogglePause={togglePause}
        hasLoggedSets={sets.length > 0}
      />

      {/* Header. The right-hand slot below used to sit empty (a
          justify-content: space-between row with only one child) while
          Finish Workout lived at the very bottom of the page, below every
          exercise card — every real training app keeps Finish persistently
          visible instead. Styled after Progress.jsx's "🏆 PBs" pill, the
          app's existing convention for a compact header-slot action. */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <SessionClock startMs={sessionStartMs} wakeLockHeld={wakeLockHeld} color={color} />
          <h1 style={{ fontSize: type.size.title, fontWeight: type.weight.bold, letterSpacing: type.letterSpacing.tight }}><DayIcon day={session.workout_day} size={icon.heading} /> {plan.name}</h1>
          {/* colors.muted2 / type.size.lg, matching Home/Progress/History/
              PersonalBests' page-subtitle convention -- this was the one
              page whose subtitle used a different color/size pair
              (2026-09-06 UI review, item 18c). */}
          <p style={{ color: colors.muted2, fontSize: type.size.lg, marginTop: 2 }}>{session.date}</p>
        </div>
        <button className="tap-target" onClick={finishWorkout} disabled={finishing}
          style={{ background: 'none', border: `1px solid ${colors.border}`, borderRadius: 100, color,
            fontSize: type.size.base, fontWeight: type.weight.semibold, cursor: 'pointer',
            padding: '7px 14px', whiteSpace: 'nowrap', opacity: finishing ? 0.55 : 1, flexShrink: 0,
            display: 'flex', alignItems: 'center', gap: 4 }}>
          {finishing ? 'Saving…' : <><IconCheck size={icon.body} /> Finish Workout</>}
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
          <DisclosureRow key={ex.id} ref={el => { cardRefs.current[ex.id] = el }}
            // Auto-advance's scrollIntoView({ block: 'start' }) aligns this card to the
            // top of the *viewport*, but the header is position: fixed and would cover
            // it. --header-height is already published on .page-shell (App.jsx) and
            // inherits down, so this needs no new plumbing.
            // bodyPadding no longer needs an override here -- item 20
            // resolved DisclosureRow's default to the same space.xl value
            // this used to spell out explicitly.
            style={{ marginBottom: space.md, scrollMarginTop: 'calc(var(--header-height, 0px) + 8px)' }}
            isOpen={isOpen}
            onToggle={async () => {
              const opening = !isOpen
              setExpanded(opening ? ex.id : null)
              if (opening) {
                const data = await ensureLastPerf(ex)
                const pf = prefillFor(ex.id, sets, prs, data, { repsHigh: ex.repsHigh, bodyweight: ex.bodyweight })
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
                    <span style={{ fontWeight: type.weight.bold, fontSize: type.size.strong }}>{ex.name}</span>
                    {/* The day colour, not mint: the set-dots beside it (below)
                        already fill in `color` to mean "done", so a mint check
                        here was a second "done" colour in the same row — on
                        Lower B, a mint tick next to orange dots (2026-09-06 UI
                        review, item 18b). One colour, one meaning. */}
                    {complete && <IconCheck size={icon.heading} color={color} />}
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
              <IconClipboardDocumentList size={icon.body} /> Form cues + demo
            </button>

            {/* Per-exercise note. Wave 1.3: a failed save used to leave the note on
                screen looking saved, because the optimistic update landed
                first and only the toast knew better. It now keeps the words,
                marks them unsaved, and leaves the editor open holding them. */}
            {noteEditing?.exId === ex.id ? (
              /* 1rem, not type.size.md (0.8rem). iOS Safari zooms the whole page
                 in when a focused field computes below 16px, and this is a field
                 the user focuses *between sets* — the zoom lands mid-workout and
                 shifts the Log Set button out from under their thumb. Same floor
                 .field and PersonalBests' inputs already document. This was the
                 app's only focusable text control without it; found by the owner,
                 not by a review. */
              <textarea autoFocus
                value={noteEditing.text}
                onChange={e => setNoteEditing(ed => ({ ...ed, text: e.target.value }))}
                onBlur={e => saveNote(ex.id, e.target.value.trim())}
                style={{ width: '100%', background: colors.border, border: 'none', borderRadius: 8, color: colors.textSecondary, fontSize: '1rem', padding: 8, resize: 'vertical' }} />
            ) : notes[ex.id] ? (
              <p onClick={() => setNoteEditing({ exId: ex.id, text: notes[ex.id] })} style={{ color: noteFailed[ex.id] ? colors.danger : colors.muted, fontSize: type.size.base, fontStyle: 'italic', marginBottom: 10, cursor: 'text' }}>
                <IconPencil size={icon.body} /> {notes[ex.id]}
                {noteFailed[ex.id] && <span style={{ color: colors.muted, fontStyle: 'normal' }}> · not saved</span>}
              </p>
            ) : (
              <button className="tap-target" onClick={() => setNoteEditing({ exId: ex.id, text: '' })} style={{ background: 'none', border: 'none', color: colors.muted, fontSize: type.size.sm, padding: 0, marginBottom: 10, cursor: 'pointer' }}>Add note</button>
            )}

            {/* Last workout + overload hint */}
            {!(ex.id in lastPerf) && (
              <Skeleton height={14} width="70%" style={{ marginBottom: 12 }} />
            )}
            {lastPerf[ex.id] && lastPerf[ex.id].sets?.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                {/* The suggested load is the app's best differentiator — none of
                    Strong/Hevy/Fitbod tell you what to lift next from your own log —
                    so it renders above the raw history it supersedes, at a size that
                    actually outranks it (was 0.75rem, smaller than the history below it).
                    Labeled "Up next" (Eyebrow, same colors.muted token "Last workout"
                    already uses below) so this forward-looking block reads as its own
                    scoped section instead of floating unlabeled above the "Last workout"
                    caption -- Task 4 UI review, item 2: that caption otherwise ends up
                    scoping only the raw history rows, not the suggestion pair sitting
                    above it, which was the main "looks bolted on" tell. Warm-up itself
                    stays on colors.muted rather than accent (Task 4 UI/UX review, item 1
                    from both passes): it's a preparatory cue, not the actionable target --
                    Suggested is the one number that also drives the weight/reps steppers
                    below, so it alone keeps the accent color and should visually outrank
                    Warm-up, not tie with it. */}
                {(lastPerf[ex.id].suggestion?.warmup || lastPerf[ex.id].suggestion) && (
                  <Eyebrow color={colors.muted} style={{ marginBottom: 4 }}>Up next</Eyebrow>
                )}
                {lastPerf[ex.id].suggestion?.warmup && (
                  <p style={{ color: colors.muted, fontSize: type.size.lg, fontWeight: type.weight.semibold, marginBottom: 4 }}>
                    Warm-up: <strong>{lastPerf[ex.id].suggestion.warmup.weight_kg}kg</strong> × {lastPerf[ex.id].suggestion.warmup.reps}
                  </p>
                )}
                {(() => {
                  // Backend suggestion (single actionable weight x reps) takes
                  // over the display once the endpoint sends one. When it's
                  // absent -- an old cached service-worker response, or a
                  // rolling deploy that hasn't reached the backend yet -- fall
                  // back to the original overloadSuggestion-derived hint so a
                  // lifter never sees a worse experience than before.
                  const suggestion = lastPerf[ex.id].suggestion
                  if (suggestion) {
                    return (
                      <p style={{ color: colors.accent, fontSize: type.size.lg, fontWeight: type.weight.semibold, marginBottom: 8 }}>
                        Suggested: <strong>{suggestion.weight_kg}kg</strong> × <strong>{suggestion.reps}</strong>
                      </p>
                    )
                  }
                  const sug = overloadSuggestion(lastPerf[ex.id].sets, ex.repsHigh)
                  return sug ? (
                    <p style={{ color: colors.accent, fontSize: type.size.lg, fontWeight: type.weight.semibold, marginBottom: 8 }}>
                      Suggested <strong>{sug.weight}kg</strong> · Target {ex.repsLow}–{ex.repsHigh}
                    </p>
                  ) : null
                })()}
                <Eyebrow color={colors.muted} style={{ marginBottom: 4 }}>Last workout</Eyebrow>
                {lastPerf[ex.id].sets.map(s => (
                  <p key={s.set_number} className="font-mono" style={{ color: colors.muted, fontSize: type.size.md }}>{s.weight_kg}kg × {s.reps}</p>
                ))}
              </div>
            )}

            {/* Logger controls. Rendered before the logged-sets list (below) so the
                stepper pair and Log Set button sit at a fixed offset from the card
                header for the whole exercise -- previously each logged set inserted
                a row above this block, walking the button ~35px further down the
                card per set (~105px by set 3). The set-dots in the card header
                already carry at-a-glance progress, so nothing is lost by the list
                sitting below the thing you actually touch. */}
            <div style={{ marginTop: 14 }}>
              {/* flex-wrap: the two fixed-width steppers exceed card width below ~380px;
                  Reps drops under Weight instead of clipping off-screen. */}
              <div style={{ display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap', rowGap: 14, marginBottom: 14 }}>
                <div style={{ textAlign: 'center' }}>
                  <WeightFieldLabel bodyweight={ex.bodyweight} />
                  <NumControl value={weight} onChange={setWeight} step={2.5} min={0} mode="decimal" label={ex.bodyweight ? 'added weight' : 'weight'} />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <Eyebrow style={{ marginBottom: 8 }}>Reps</Eyebrow>
                  <NumControl value={reps} onChange={setReps} step={1} min={1} label="reps" />
                </div>
              </div>
              <button className="btn-primary" onClick={() => logSet(ex)} disabled={logging}
                style={{ background: color, fontSize: type.size.body, padding: '12px' }}>
                {logging ? 'Logging…' : `Log Set ${nextSetNumber(exSets)}`}
              </button>
            </div>

            {/* Logged sets — below the logger, so logging a set confirms
                immediately underneath the button you just pressed instead of
                pushing the button away from your thumb. */}
            {exSets.length > 0 && (
              <div style={{ marginTop: 14 }}>
                {exSets.map(s => (
                  <SetRow key={s.id} s={s} armed={confirmSetId === s.id} onRequestDelete={requestDeleteSet} />
                ))}
              </div>
            )}

            {/* Muscles. No `color` here: Chip's non-toggle (label) branch
                hardcodes colors.muted regardless of what's passed, so this
                was a silent no-op (2026-09-06 UI review, item 18a). */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
              {ex.muscles.map(m => (
                <Chip key={m}>{m}</Chip>
              ))}
            </div>
          </DisclosureRow>
        )
      })}

      {cuesEx && (
        <ExerciseCuesModal ex={cuesEx} color={color} onClose={() => setCuesEx(null)} />
      )}
    </div>
  )
}
