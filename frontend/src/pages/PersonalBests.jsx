import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { usePlan } from '../lib/planContext'
import { allExercises } from '../lib/muscles'
import Skeleton from '../components/Skeleton'
import Toast from '../components/Toast'
import EmptyState from '../components/EmptyState'
import LoadError from '../components/LoadError'
import DisclosureRow from '../components/DisclosureRow'
import Eyebrow from '../components/Eyebrow'
import { useToast } from '../lib/useToast'
import { useConfirmWindow } from '../lib/useConfirmWindow'
import { colors, type, space, icon } from '../lib/theme'
import { IconCheck, IconTrash, IconArrowLeft, IconPlus, IconTrophy } from '../icons'

const labelStyle = {
  display: 'block', color: colors.muted, fontSize: type.size.sm, fontWeight: type.weight.bold,
  letterSpacing: type.labelTracking, textTransform: 'uppercase', marginBottom: 6,
}
const fieldStyle = {
  width: '100%', background: colors.border, color: colors.text, border: 'none',
  borderRadius: 8, padding: '10px 8px',
  // Exactly 1rem, not type.size.body (0.9rem). iOS Safari zooms the whole page
  // in when a focused input computes below 16px, which on a phone throws the
  // rest of the form off-screen — the same rule .field already documents and
  // the auth screens already follow. This is an inline style, so it wins over
  // the .personal-bests-form CSS rule; both are set for that reason.
  fontSize: '1rem',
}

export default function PersonalBests() {
  const nav = useNavigate()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  // Wave 1.1: same shape as History — a failed read rendered
  // "No historical PBs logged yet.", which is a claim about the user's
  // history, not about this device's connectivity.
  const [loadError, setLoadError] = useState(false)
  const { plan } = usePlan()
  // The picker lists exercises by name, not in plan order.
  const exercises = useMemo(
    () => [...allExercises(plan)].sort((a, b) => a.name.localeCompare(b.name)), [plan])
  // Empty until the user picks, so a plan that arrives after mount still gets
  // a default instead of leaving the select on a value with no option.
  const [pickedId, setExerciseId] = useState('')
  const exerciseId = pickedId || exercises[0]?.id || ''
  const [weight, setWeight] = useState(20)
  const [reps, setReps] = useState(1)
  const [year, setYear] = useState(new Date().getFullYear())
  // 2026-10-03 design review 1.5: the inputs hold the raw string while the
  // user types. `parseFloat('') || 0` used to write the default straight back
  // on the same keystroke, so the field could never be emptied — and on Year
  // that meant clearing showed 2026 again, so typing "14" produced 202614,
  // which the API rejects. The committed numbers above stay authoritative for
  // the save payload; these are only what the input displays.
  const [weightText, setWeightText] = useState('20')
  const [repsText, setRepsText] = useState('1')
  const [yearText, setYearText] = useState(String(new Date().getFullYear()))
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const { toast, showToast } = useToast()
  const { armedId: confirmId, confirm: confirmRemove } = useConfirmWindow()
  // Closed by default: this is a page you visit to read your PBs far more
  // often than to add one, so the 5-field form starts hidden behind a
  // disclosure instead of competing with the list for attention on load
  // (2026-09-06 UI review, item 19).
  const [addOpen, setAddOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      setEntries(await api.get('/personal-bests'))
      setLoadError(false)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  // The comparison is a side note: a failed load hides it and never blocks the page.
  const [sharing, setSharing] = useState(false)
  const [top, setTop] = useState({})
  const loadTop = useCallback(async () => {
    try {
      const res = await api.get('/personal-bests/top')
      setSharing(res?.sharing === true)
      setTop(res?.top && typeof res.top === 'object' ? res.top : {})
    } catch { /* leave the toggle off and the lines hidden */ }
  }, [])

  useEffect(() => {
    load()
    loadTop()
  }, [])

  async function toggleSharing(next) {
    setSharing(next)
    try {
      await api.put('/personal-bests/sharing', { sharing: next })
      showToast('Saved')
    } catch {
      setSharing(!next)
      showToast('Failed to update sharing', 'error')
    }
  }

  async function submit(e) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    const exercise = exercises.find(ex => ex.id === exerciseId)
    try {
      const created = await api.post('/personal-bests', {
        exercise_id: exerciseId, exercise_name: exercise.name,
        weight_kg: weight, reps, achieved_year: year,
        achieved_note: note.trim() || null,
      })
      setEntries(prev => [...prev, created])
      setNote('')
    } catch (err) {
      if (err.message?.includes('409')) showToast("You've already logged this exact PB (same exercise, weight, reps, and year).", 'error')
      else showToast('Failed to save. Check the values and try again.', 'error')
    }
    setSaving(false)
  }

  async function remove(id) {
    if (!confirmRemove(id)) return
    try {
      await api.delete(`/personal-bests/${id}`)
      setEntries(prev => prev.filter(e => e.id !== id))
    } catch { showToast('Failed to delete', 'error') }
  }

  const grouped = entries.reduce((acc, e) => {
    (acc[e.exercise_name] ??= []).push(e)
    return acc
  }, {})

  return (
    <div style={{ paddingTop: 16 }}>
      <Toast toast={toast} />
      <button className="tap-target" onClick={() => nav('/progress')}
        style={{ background: 'none', border: 'none', color: colors.accent, fontSize: type.size.md,
          fontWeight: type.weight.semibold, cursor: 'pointer', padding: 0, marginBottom: 12,
          display: 'flex', alignItems: 'center', gap: 4 }}>
        <IconArrowLeft size={icon.body} /> Progress
      </button>
      <h1 style={{ fontSize: type.size.title, fontWeight: type.weight.bold, letterSpacing: type.letterSpacing.tight, marginBottom: 4 }}>Personal Bests</h1>
      <p style={{ color: colors.muted2, fontSize: type.size.lg, marginBottom: 20 }}>
        Historical PBs from before you started logging here
      </p>

      {/* List first: this page is visited to read PBs far more often than to
          add one, so the list -- not a 5-field form -- gets the eye on load
          (2026-09-06 UI review, item 19). The add form moved into the
          disclosure below. */}
      {loadError ? (
        <LoadError what="your personal bests" onRetry={() => { setLoading(true); load() }} />
      ) : loading ? <Skeleton height={72} /> : Object.keys(grouped).length === 0 ? (
        <>
          <EmptyState title="No historical PBs logged yet."
            subtitle="Add a best from before you started logging here, so Progress has a baseline." />
          <button type="button" className="btn-primary" style={{ marginTop: space.md }}
            onClick={() => setAddOpen(true)}>Add a personal best</button>
        </>
      ) : Object.entries(grouped).map(([name, rows]) => (
        <div key={name} className="card" style={{ padding: space.xl, marginBottom: 10 }}>
          <p style={{ fontWeight: type.weight.semibold, fontSize: type.size.body, marginBottom: 8 }}>{name}</p>
          {top[rows[0].exercise_id] && (
            <p style={{ color: colors.muted, fontSize: type.size.base, marginBottom: 8 }}>
              Other members' top 3: {top[rows[0].exercise_id].join(', ')} kg est. 1RM
            </p>
          )}
          {rows.map(r => {
            const armed = confirmId === r.id
            return (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: space.sm, padding: '10px 0', borderBottom: `1px solid ${colors.border}` }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: space.xs, flexShrink: 0 }}>
                  <IconTrophy size={icon.body} color={colors.success} />
                  {r.single_kg == null ? (
                    <span className="font-mono" style={{ fontSize: type.size.body, fontWeight: type.weight.bold, color: colors.success }}>{r.weight_kg} kg × {r.reps}</span>
                  ) : (
                    <span style={{ display: 'flex', flexDirection: 'column', whiteSpace: 'nowrap' }}>
                      <span className="font-mono" style={{ fontSize: type.size.body, fontWeight: type.weight.bold, color: colors.success }}>
                        {r.single_kg} kg
                        {r.single_estimated && <span style={{ color: colors.muted, fontSize: type.size.base, fontWeight: type.weight.semibold }}> est.</span>}
                      </span>
                      {r.single_estimated && (
                        <span style={{ color: colors.muted, fontSize: type.size.base }}>from {r.weight_kg} kg × {r.reps}</span>
                      )}
                    </span>
                  )}
                </span>
                <span style={{ color: colors.muted2, fontSize: type.size.base }}>{r.achieved_year}{r.achieved_note ? ` · ${r.achieved_note}` : ''}</span>
                <button className="tap-target" onClick={() => remove(r.id)}
                  aria-label={armed ? `confirm delete personal best ${name}` : `delete personal best ${name}`}
                  style={{ background: 'none', border: 'none', color: armed ? colors.danger : colors.muted, cursor: 'pointer', fontSize: armed ? type.size.base : '1rem', fontWeight: armed ? type.weight.bold : type.weight.regular }}>
                  {armed ? <IconCheck size={icon.control} /> : <IconTrash size={icon.control} />}
                </button>
              </div>
            )
          })}
        </div>
      ))}

      {(entries.length > 0 || sharing) && (
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: space.sm, marginTop: 20, minHeight: 44, cursor: 'pointer' }}>
        <input type="checkbox" checked={sharing} onChange={e => toggleSharing(e.target.checked)}
          style={{ width: 20, height: 20, marginTop: 0, flexShrink: 0, accentColor: 'var(--accent)' }} />
        <span>
          <span style={{ display: 'block', fontSize: type.size.body }}>Share my lifts with other members</span>
          <span style={{ display: 'block', color: colors.muted, fontSize: type.size.base }}>
            Your best est. 1RM per exercise, from these PBs and your logged workouts, can appear in other members' top 3, never with your name. Only members of this app see it. Untick any time.
          </span>
        </span>
      </label>
      )}

      <DisclosureRow
        isOpen={addOpen}
        onToggle={() => setAddOpen(o => !o)}
        style={{ marginTop: 14 }}
        header={<Eyebrow color={colors.accent}><IconPlus size={icon.caption} /> Add</Eyebrow>}
      >
        <form onSubmit={submit} className="personal-bests-form">
          <label htmlFor="pb-exercise" style={labelStyle}>Exercise</label>
          <select id="pb-exercise" value={exerciseId} onChange={e => setExerciseId(e.target.value)}
            style={{ ...fieldStyle, marginBottom: 14 }}>
            {exercises.map(ex => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
          </select>

          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <label htmlFor="pb-weight" style={labelStyle}>Weight (kg)</label>
              <input id="pb-weight" type="number" inputMode="decimal" value={weightText}
                onChange={e => { const t = e.target.value; setWeightText(t); const v = parseFloat(t); if (!Number.isNaN(v)) setWeight(v) }}
                onBlur={() => { if (weightText.trim() === '') setWeightText(String(weight)) }}
                style={{ ...fieldStyle, width: '100%' }} />
            </div>
            <div style={{ flex: 1 }}>
              <label htmlFor="pb-reps" style={labelStyle}>Reps</label>
              <input id="pb-reps" type="number" inputMode="numeric" value={repsText}
                onChange={e => { const t = e.target.value; setRepsText(t); const v = parseInt(t, 10); if (!Number.isNaN(v)) setReps(v) }}
                onBlur={() => { if (repsText.trim() === '') setRepsText(String(reps)) }}
                style={{ ...fieldStyle, width: '100%' }} />
            </div>
            <div style={{ flex: 1 }}>
              <label htmlFor="pb-year" style={labelStyle}>Year</label>
              <input id="pb-year" type="number" inputMode="numeric" value={yearText}
                onChange={e => { const t = e.target.value; setYearText(t); const v = parseInt(t, 10); if (!Number.isNaN(v)) setYear(v) }}
                onBlur={() => { if (yearText.trim() === '') setYearText(String(year)) }}
                style={{ ...fieldStyle, width: '100%' }} />
            </div>
          </div>

          <label htmlFor="pb-note" style={labelStyle}>Note (optional)</label>
          <input id="pb-note" type="text" value={note} onChange={e => setNote(e.target.value)}
            placeholder="e.g. Fall, gym PR meet" style={{ ...fieldStyle, marginBottom: 16 }} />
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : <><IconPlus size={icon.body} /> Add Personal Best</>}
          </button>
        </form>
      </DisclosureRow>
    </div>
  )
}
