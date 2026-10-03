import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { PLAN, getNextWorkoutId, DAY_COLORS, DAY_COLOR_FALLBACK, CYCLE } from '../data/workoutPlan'
import { useActiveSession } from '../lib/activeSession'
import { track } from '../lib/analytics'
import { downloadExport } from '../lib/exportData'
import { groupRecovery, lastWorkoutLabel } from '../lib/recovery'
import MuscleGroupPicker from '../components/MuscleGroupPicker'
import Eyebrow from '../components/Eyebrow'
import Toast from '../components/Toast'
import EmptyState from '../components/EmptyState'
import LoadError from '../components/LoadError'
import { useToast } from '../lib/useToast'
import { colors, type, space } from '../lib/theme'
import DayIcon from '../components/DayIcon'

export function planForDay(workoutDay) {
  return PLAN[workoutDay] || { icon: 'upper', name: 'Workout', tag: '', exercises: [] }
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
      color: colors.muted2, fontSize: type.size.xs }}>
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
  // Wave 1.1 (2026-10-03 design review): a rejected read is not an empty
  // account. Before this, `.catch(() => setLoading(false))` left `sessions` at
  // [] and the page rendered four simultaneous falsehoods: "No sessions logged
  // yet", the wrong next workout day (getNextWorkoutId([]) always returns
  // upper_a), an exercise preview for a day that may not be next, and Start
  // replacing Resume over a live workout. `loadError` is what separates "no
  // sessions" from "could not ask".
  const [loadError, setLoadError] = useState(false)
  const [starting, setStarting] = useState(false)
  const { toast, showToast } = useToast()
  const [recency, setRecency] = useState([])
  const [recencyError, setRecencyError] = useState(false)
  const nav = useNavigate()
  const { active, refresh, ready, failed: activeFailed } = useActiveSession()

  const load = useCallback(async () => {
    try {
      const s = await api.get('/sessions')
      setSessions(s)
      setLoadError(false)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadRecency = useCallback(async () => {
    // The picker is additive — if this fails, Home still works without it, but
    // it must not be handed an empty list, which reads as "you have never
    // trained anything" rather than "we could not check" (Wave 1.1).
    try {
      setRecency(await api.get('/exercises/recency'))
      setRecencyError(false)
    } catch {
      setRecencyError(true)
    }
  }, [])

  useEffect(() => {
    load()
    loadRecency()
  }, [load, loadRecency])

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
      showToast("Couldn't start the workout — try again", 'error')
      setStarting(false)
    }
  }

  const startWorkout = () => startDay(nextId)

  if (loading || !ready) return (
    <div style={{ paddingTop: 32, textAlign: 'center', color: colors.muted }}>Loading…</div>
  )

  // A rejected read renders none of the page's own claims. There is no honest
  // version of "here is the next workout, here are its exercises, press Start"
  // when we do not know what is in progress — getNextWorkoutId([]) answers
  // `upper_a` by default, so the wrong day is not an unlikely edge case, it is
  // what an empty list always produces. Try again is the only action offered:
  // both Start and Resume are guesses right now.
  //
  // Deliberately not a toast. The failure is persistent, the toast lives 2.5s,
  // and `.toast` renders at top:20px over the fixed header — nobody is looking
  // there mid-workout. `.form-error` is the app's existing error surface (the
  // one Wave 0.1 fixed to 4.62:1), so this adds no new visual language.
  if (loadError || activeFailed) {
    return (
      <div style={{ paddingTop: 16 }}>
        <Toast toast={toast} />
        <Eyebrow color={colors.danger} size={type.size.base} style={{ marginBottom: 4 }}>
          Couldn't load
        </Eyebrow>
        <h1 style={{ fontSize: type.size.title, fontWeight: type.weight.bold, letterSpacing: type.letterSpacing.tight, lineHeight: 1.1 }}>
          Check your connection
        </h1>
        <LoadError what="your workouts" onRetry={() => { setLoading(true); load(); refresh() }} />
        {/* The picker needs /exercises/recency, and an empty list reads as
            "you have never trained anything" rather than "we could not check" —
            so it is withheld on its own failure too. */}
        {!recencyError && (
          <MuscleGroupPicker
            groups={groupRecovery(recency)}
            lastTrainedByDay={lastTrainedByDay(sessions)}
            activeSession={active}
            starting={starting}
            onStart={startDay}
          />
        )}
        <VersionStamp />
      </div>
    )
  }

  return (
    <div style={{ paddingTop: 16 }}>
      <Toast toast={toast} />
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <Eyebrow color={colors.accent} size={type.size.base} style={{ marginBottom: 4 }}>
          {active ? 'In progress' : 'Next up'}
        </Eyebrow>
        <h1 style={{ fontSize: type.size.title, fontWeight: type.weight.bold, letterSpacing: type.letterSpacing.tight, lineHeight: 1.1 }}>
          <DayIcon day={next.id} /> {next.name}
        </h1>
        <p style={{ color: colors.muted2, marginTop: 6, fontSize: type.size.lg }}>{next.tag}</p>
        <p style={{ color: colors.muted, marginTop: 6, fontSize: type.size.md }}>
          {lastWorkoutLabel(sessions)}
        </p>
      </div>

      {/* Exercise preview */}
      {next.exercises.length > 0 && (
        <div className="card" style={{ padding: space.xxl, marginBottom: space.xxl }}>
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
                <p style={{ fontWeight: type.weight.semibold, fontSize: type.size.body }}>{ex.name}</p>
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
      {!recencyError && (
        <MuscleGroupPicker
          groups={groups}
          lastTrainedByDay={trainedByDay}
          activeSession={active}
          starting={starting}
          onStart={startDay}
        />
      )}

      {/* Last session */}
      {lastSession && lastPlan && (
        <div>
          <Eyebrow size={type.size.sm} style={{ marginBottom: 12 }}>
            Last session
          </Eyebrow>
          {/* A real <button>, not a <div onClick>, for the same reason
              DisclosureRow's header row is one: a click handler on a <div>
              has no role, no keyboard access and no :active feedback. The
              chrome-reset lives on the inner button, same as DisclosureRow's
              two-layer split — putting it on the same element as `.card`
              cancels out `.card`'s own background/border (caught in UI/UX
              review: the card lost its visible box entirely on first try). */}
          <div className="card" style={{ overflow: 'hidden' }}>
            <button type="button" onClick={() => nav('/history')} style={{
              width: '100%', background: 'none', border: 'none', margin: 0, font: 'inherit',
              color: 'inherit', textAlign: 'left', cursor: 'pointer', padding: space.xl,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <p style={{ fontWeight: type.weight.semibold }}><DayIcon day={lastPlan.id} /> {lastPlan.name}</p>
                <p style={{ color: colors.muted, fontSize: type.size.md, marginTop: 2 }}>{lastSession.date}</p>
              </div>
              <span style={{ color: colors.muted, fontSize: '1.2rem' }}>›</span>
            </button>
          </div>
        </div>
      )}

      {sessions.length === 0 && (
        <EmptyState title="No sessions logged yet." subtitle="Start your first workout above 💪" />
      )}

      {/* Nothing to export on a first-run install — reuses the same
          sessions.length check the EmptyState above already relies on,
          rather than a second empty-state condition. */}
      {sessions.length > 0 && (
        <button
          className="tap-target"
          onClick={async () => {
            try { await downloadExport() }
            catch { showToast("Couldn't export your data — try again", 'error') }
          }}
          style={{ marginTop: 24, background: 'none', border: 'none', color: colors.muted2,
                   fontSize: type.size.md, textDecoration: 'underline', cursor: 'pointer' }}
        >
          Export my data
        </button>
      )}
      <VersionStamp />
    </div>
  )
}
