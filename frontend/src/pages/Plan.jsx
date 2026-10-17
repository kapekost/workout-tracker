import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import DayIcon from '../components/DayIcon'
import DisclosureRow from '../components/DisclosureRow'
import LoadError from '../components/LoadError'
import Toast from '../components/Toast'
import { DAY_COLORS, DAY_COLOR_FALLBACK } from '../data/workoutPlan'
import { useActiveSession } from '../lib/activeSession'
import { modifyOp, planUpdateBody, rankSwapCandidates } from '../lib/planEdit'
import { usePlan } from '../lib/planContext'
import { useConfirmWindow } from '../lib/useConfirmWindow'
import { useToast } from '../lib/useToast'
import { colors, type, space, icon } from '../lib/theme'
import { IconArrowLeft, IconMinus, IconPlus } from '../icons'

const FINISH_FIRST = 'Finish or discard your current workout first'
const SWAP_SHOWN = 8
const swapLine = (ex, dayName, picked) =>
  `Replaces ${ex.name} and goes to the end of ${dayName} with ${picked.sets}×${picked.reps_low}–${picked.reps_high}. History for ${ex.name} stays under its own name and will not show under the new one.`

const linkButton = {
  background: 'none', border: 'none', color: colors.accent, cursor: 'pointer', padding: 0,
  fontSize: type.size.md, fontWeight: type.weight.semibold,
}
const mutedText = { color: colors.muted, fontSize: type.size.md }

function Stepper({ label, value, min, max, disabled, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space.sm }}>
      <span style={{ color: colors.muted, fontSize: type.size.sm, fontWeight: type.weight.bold,
        letterSpacing: type.labelTracking, textTransform: 'uppercase' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: space.sm }}>
        <button type="button" className="btn-icon" aria-label={`decrease ${label}`}
          disabled={disabled || value <= min} onClick={() => onChange(value - 1)}>
          <IconMinus size={icon.control} />
        </button>
        <span className="font-mono" style={{ minWidth: 32, textAlign: 'center', fontSize: type.size.strong, fontWeight: type.weight.bold }}>{value}</span>
        <button type="button" className="btn-icon" aria-label={`increase ${label}`}
          disabled={disabled || value >= max} onClick={() => onChange(value + 1)}>
          <IconPlus size={icon.control} />
        </button>
      </div>
    </div>
  )
}

export default function Plan() {
  const nav = useNavigate()
  const { plan, cycle, retry } = usePlan()
  const { active, refresh } = useActiveSession()
  const { toast, showToast } = useToast()
  const { armedId, confirm } = useConfirmWindow()
  const [openDay, setOpenDay] = useState(null)
  // One editor open at a time: the exercise, its draft sets/reps, and whether
  // the swap list is showing in place of the steppers.
  const [edit, setEdit] = useState(null)
  const [catalog, setCatalog] = useState(null)
  const [catalogError, setCatalogError] = useState(false)
  const [busy, setBusy] = useState(false)
  // State lags a render, so a second tap in the same frame would still see busy=false.
  const inFlight = useRef(false)

  const days = cycle.map(id => plan[id]).filter(Boolean)
  const locked = Boolean(active)
  const ranked = edit?.swapping && catalog ? rankSwapCandidates(catalog, plan, edit.ex) : []
  const candidates = edit?.showAll ? ranked : ranked.slice(0, SWAP_SHOWN)

  // Every write refetches the plan, so each screen that reads it shows the change.
  async function write(path, body, done) {
    if (inFlight.current) return false
    inFlight.current = true
    setBusy(true)
    try {
      await api.post(path, body)
      retry()
      showToast(done)
      return true
    } catch (err) {
      if (err.status === 409) refresh()
      // No answer, or a server error: the write may have landed, so show the real plan.
      if (!err.status || err.status >= 500) retry()
      showToast(err.detail ?? "Couldn't save your plan. Try again.", 'error')
      return false
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  function startEdit(dayKey, ex) {
    setEdit({
      dayKey, ex, swapping: false, picked: null, showAll: false,
      draft: { sets: ex.sets, repsLow: ex.repsLow, repsHigh: ex.repsHigh },
    })
  }

  // Reps from never passes reps to: moving one pulls the other along.
  function setDraft(field, value) {
    setEdit(e => {
      const draft = { ...e.draft, [field]: value }
      if (field === 'repsLow' && draft.repsLow > draft.repsHigh) draft.repsHigh = draft.repsLow
      if (field === 'repsHigh' && draft.repsHigh < draft.repsLow) draft.repsLow = draft.repsHigh
      return { ...e, draft }
    })
  }

  async function saveEdit() {
    const op = modifyOp(edit.ex, edit.draft)
    if (!op) return setEdit(null)
    if (await write('/plan/update', planUpdateBody(edit.dayKey, [op]), 'Saved')) setEdit(null)
  }

  async function loadCatalog() {
    setCatalogError(false)
    try {
      setCatalog(await api.get('/plan/catalog'))
    } catch {
      setCatalogError(true)
    }
  }

  function openSwap() {
    setEdit(e => ({ ...e, swapping: true, picked: null, showAll: false }))
    if (catalog === null) loadCatalog()
  }

  async function confirmSwap() {
    const ops = [{ op: 'remove', exercise_id: edit.ex.id }, { op: 'add', ...edit.picked }]
    if (await write('/plan/update', planUpdateBody(edit.dayKey, ops), 'Swapped')) setEdit(null)
  }

  async function reset() {
    if (!confirm('reset')) return
    if (await write('/plan/reset', undefined, 'Plan reset')) setEdit(null)
  }

  return (
    <div style={{ paddingTop: 16 }}>
      <Toast toast={toast} />
      <button className="tap-target" onClick={() => nav('/')}
        style={{ background: 'none', border: 'none', color: colors.accent, fontSize: type.size.md,
          fontWeight: type.weight.semibold, cursor: 'pointer', padding: 0, marginBottom: 12,
          display: 'flex', alignItems: 'center', gap: 4 }}>
        <IconArrowLeft size={icon.body} /> Home
      </button>
      <h1 style={{ fontSize: type.size.title, fontWeight: type.weight.bold, letterSpacing: type.letterSpacing.tight, marginBottom: 4 }}>Your plan</h1>
      <p style={{ color: colors.muted2, fontSize: type.size.lg, marginBottom: 20 }}>
        Change the sets and reps, or swap an exercise.
      </p>

      {locked && (
        <div className="card" style={{ padding: space.xl, marginBottom: 14, color: colors.muted2, fontSize: type.size.md }}>
          {FINISH_FIRST}
        </div>
      )}

      {days.map(day => {
        const color = DAY_COLORS[day.id] || DAY_COLOR_FALLBACK
        return (
          <DisclosureRow
            key={day.id}
            isOpen={openDay === day.id}
            onToggle={() => setOpenDay(d => (d === day.id ? null : day.id))}
            style={{ marginBottom: 10 }}
            header={
              <span style={{ display: 'flex', alignItems: 'center', gap: space.sm }}>
                <DayIcon day={day.id} />
                <span>
                  <span style={{ display: 'block', fontWeight: type.weight.semibold }}>{day.name}</span>
                  <span style={{ display: 'block', color: colors.muted, fontSize: type.size.base, marginTop: 2 }}>{day.tag}</span>
                </span>
              </span>
            }
          >
            {day.exercises.map((ex, i) => {
              const editing = !locked && edit?.dayKey === day.id && edit.ex.id === ex.id
              return (
                <div key={ex.id} style={{
                  padding: '10px 0',
                  borderBottom: i < day.exercises.length - 1 ? `1px solid ${colors.border}` : 'none',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: space.sm }}>
                    <span style={{ fontWeight: type.weight.semibold, fontSize: type.size.body }}>{ex.name}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: space.md }}>
                      <span className="font-mono" style={{ color, fontSize: type.size.md, fontWeight: type.weight.bold, whiteSpace: 'nowrap' }}>
                        {ex.sets}×{ex.repsLow}–{ex.repsHigh}
                      </span>
                      {!locked && !editing && (
                        <button type="button" className="tap-target" aria-label={`Edit ${ex.name}`}
                          disabled={busy} onClick={() => startEdit(day.id, ex)} style={linkButton}>Edit</button>
                      )}
                    </span>
                  </div>

                  {editing && !edit.swapping && (
                    <div style={{ marginTop: space.md, display: 'grid', gap: space.md }}>
                      <Stepper label="Sets" value={edit.draft.sets} min={1} max={10} disabled={busy}
                        onChange={v => setDraft('sets', v)} />
                      <Stepper label="Reps from" value={edit.draft.repsLow} min={1} max={50} disabled={busy}
                        onChange={v => setDraft('repsLow', v)} />
                      <Stepper label="Reps to" value={edit.draft.repsHigh} min={1} max={50} disabled={busy}
                        onChange={v => setDraft('repsHigh', v)} />
                      <button type="button" className="btn-primary" onClick={saveEdit} disabled={busy}>
                        {busy ? 'Saving…' : 'Save'}
                      </button>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space.sm }}>
                        <button type="button" className="btn-secondary" onClick={openSwap} disabled={busy}>Swap</button>
                        <button type="button" className="btn-secondary" onClick={() => setEdit(null)} disabled={busy}>Cancel</button>
                      </div>
                    </div>
                  )}

                  {editing && edit.swapping && (
                    <div style={{ marginTop: space.md, display: 'grid', gap: space.sm }}>
                      <span style={mutedText}>Swap {ex.name} for</span>
                      {catalogError ? (
                        <LoadError what="the alternatives" onRetry={loadCatalog} />
                      ) : catalog === null ? (
                        <p style={mutedText}>Loading alternatives…</p>
                      ) : ranked.length === 0 ? (
                        <p style={mutedText}>No other exercises are free to swap in.</p>
                      ) : candidates.map(c => {
                        const picked = edit.picked?.exercise_id === c.exercise_id
                        return (
                          <button key={c.exercise_id} type="button" className="tap-target"
                            aria-pressed={picked} disabled={busy}
                            onClick={() => setEdit(e => ({ ...e, picked: c }))}
                            style={{
                              display: 'grid', gap: 2, textAlign: 'left', cursor: 'pointer', padding: space.md,
                              background: 'none', borderRadius: 10, color: colors.text,
                              border: `1px solid ${picked ? colors.accent : colors.border}`,
                            }}>
                            <span style={{ fontWeight: type.weight.semibold }}>{c.name}</span>
                            <span style={{ color: colors.muted, fontSize: type.size.base }}>{c.muscles.join(', ')}</span>
                          </button>
                        )
                      })}
                      {!edit.showAll && ranked.length > SWAP_SHOWN && (
                        <button type="button" className="btn-secondary" disabled={busy}
                          onClick={() => setEdit(e => ({ ...e, showAll: true }))}>Show all {ranked.length}</button>
                      )}
                      {edit.picked && (
                        <div style={{ display: 'grid', gap: space.sm }}>
                          <p style={{ color: colors.muted2, fontSize: type.size.md }}>{swapLine(edit.ex, day.name, edit.picked)}</p>
                          <button type="button" className="btn-primary" onClick={confirmSwap} disabled={busy}>
                            {busy ? 'Swapping…' : 'Confirm swap'}
                          </button>
                        </div>
                      )}
                      <button type="button" className="btn-secondary" disabled={busy}
                        onClick={() => setEdit(e => ({ ...e, swapping: false, picked: null }))}>Back</button>
                    </div>
                  )}
                </div>
              )
            })}
          </DisclosureRow>
        )
      })}

      {!locked && armedId === 'reset' && (
        <p style={{ color: colors.muted2, fontSize: type.size.md, marginTop: space.xxl }}>
          This replaces every day with the recommended plan. Your logged workouts are kept.
        </p>
      )}
      {!locked && (
        <button type="button" className="btn-secondary" onClick={reset} disabled={busy}
          style={{ width: '100%', marginTop: armedId === 'reset' ? space.md : space.xxl, color: armedId === 'reset' ? colors.danger : colors.text }}>
          {armedId === 'reset' ? 'Tap again to reset your plan' : 'Reset to recommended'}
        </button>
      )}
    </div>
  )
}
