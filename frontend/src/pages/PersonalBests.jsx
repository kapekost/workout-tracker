import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { ALL_EXERCISES } from '../data/workoutPlan'
import Skeleton from '../components/Skeleton'
import Toast from '../components/Toast'
import EmptyState from '../components/EmptyState'
import { useToast } from '../lib/useToast'
import { colors, type } from '../lib/theme'

// Eyebrow-shaped (uppercase, tracked, bold, muted caption) but kept as real
// <label> elements below, not the <Eyebrow> component: these are genuine
// form labels for the 5 fields below (Exercise/Weight/Reps/Year/Note) and
// <Eyebrow> renders a <p>, which would drop that semantic association.
// letterSpacing corrected from a stray '0.06em' to the shared
// type.labelTracking token every other eyebrow-shaped label in the app
// uses (final sweep, 2026-08-25) - color/fontSize were already tokens.
const labelStyle = {
  display: 'block', color: colors.muted, fontSize: type.size.sm, fontWeight: type.weight.bold,
  letterSpacing: type.labelTracking, textTransform: 'uppercase', marginBottom: 6,
}
const fieldStyle = {
  width: '100%', background: colors.border, color: colors.text, border: 'none',
  borderRadius: 8, padding: '10px 8px', fontSize: '0.9rem',
}

export default function PersonalBests() {
  const nav = useNavigate()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [exerciseId, setExerciseId] = useState(ALL_EXERCISES[0]?.id ?? '')
  const [weight, setWeight] = useState(20)
  const [reps, setReps] = useState(1)
  const [year, setYear] = useState(new Date().getFullYear())
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const { toast, showToast } = useToast()
  const [confirmId, setConfirmId] = useState(null)

  useEffect(() => {
    api.get('/personal-bests').then(d => { setEntries(d); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  async function submit(e) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    const exercise = ALL_EXERCISES.find(ex => ex.id === exerciseId)
    try {
      const created = await api.post('/personal-bests', {
        exercise_id: exerciseId, exercise_name: exercise.name,
        weight_kg: weight, reps, achieved_year: year,
        achieved_note: note.trim() || null,
      })
      setEntries(prev => [...prev, created])
      setNote('')
    } catch (err) {
      if (err.message?.includes('409')) {
        showToast("You've already logged this exact PB (same exercise, weight, reps, and year).", 'error')
      } else {
        showToast('Failed to save — check the values and try again', 'error')
      }
    }
    setSaving(false)
  }

  async function remove(id) {
    if (confirmId !== id) {
      setConfirmId(id)
      setTimeout(() => setConfirmId(c => (c === id ? null : c)), 3000)
      return
    }
    setConfirmId(null)
    try {
      await api.delete(`/personal-bests/${id}`)
      setEntries(prev => prev.filter(e => e.id !== id))
    } catch {
      showToast('Failed to delete', 'error')
    }
  }

  const grouped = entries.reduce((acc, e) => {
    (acc[e.exercise_name] ??= []).push(e)
    return acc
  }, {})

  return (
    <div style={{ paddingTop: 16 }}>
      <Toast toast={toast} />
      <button className="tap-target" onClick={() => nav('/progress')}
        style={{ background: 'none', border: 'none', color: colors.mint, fontSize: type.size.md,
          fontWeight: type.weight.semibold, cursor: 'pointer', padding: 0, marginBottom: 12 }}>
        ← Progress
      </button>
      <h1 style={{ fontSize: type.size.title, fontWeight: type.weight.bold, marginBottom: 4 }}>Personal Bests</h1>
      <p style={{ color: colors.muted2, fontSize: type.size.lg, marginBottom: 20 }}>
        Historical PBs from before you started logging here
      </p>

      <form onSubmit={submit} className="card" style={{ padding: 16, marginBottom: 24 }}>
        <label style={labelStyle}>Exercise</label>
        <select value={exerciseId} onChange={e => setExerciseId(e.target.value)}
          style={{ ...fieldStyle, marginBottom: 14 }}>
          {ALL_EXERCISES.map(ex => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
        </select>

        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Weight (kg)</label>
            <input type="number" inputMode="decimal" value={weight}
              onChange={e => setWeight(parseFloat(e.target.value) || 0)}
              style={{ ...fieldStyle, width: '100%' }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Reps</label>
            <input type="number" inputMode="numeric" value={reps}
              onChange={e => setReps(parseInt(e.target.value, 10) || 1)}
              style={{ ...fieldStyle, width: '100%' }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Year</label>
            <input type="number" inputMode="numeric" value={year}
              onChange={e => setYear(parseInt(e.target.value, 10) || year)}
              style={{ ...fieldStyle, width: '100%' }} />
          </div>
        </div>

        <label style={labelStyle}>Note (optional)</label>
        <input type="text" value={note} onChange={e => setNote(e.target.value)}
          placeholder="e.g. Fall, gym PR meet"
          style={{ ...fieldStyle, marginBottom: 16 }} />

        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Saving…' : '+ Add Personal Best'}
        </button>
      </form>

      {loading ? (
        <Skeleton height={72} />
      ) : Object.keys(grouped).length === 0 ? (
        <EmptyState title="No historical PBs logged yet." />
      ) : (
        Object.entries(grouped).map(([name, rows]) => (
          <div key={name} className="card" style={{ padding: '14px 16px', marginBottom: 10 }}>
            <p style={{ fontWeight: type.weight.semibold, fontSize: '0.9rem', marginBottom: 8 }}>{name}</p>
            {rows.map(r => {
              const armed = confirmId === r.id
              return (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${colors.border}` }}>
                  <span className="font-mono" style={{ fontSize: '0.9rem', fontWeight: type.weight.bold, color: colors.amber }}>
                    {r.weight_kg}kg × {r.reps}
                  </span>
                  <span style={{ color: colors.muted2, fontSize: type.size.base }}>
                    {r.achieved_year}{r.achieved_note ? ` · ${r.achieved_note}` : ''}
                  </span>
                  <button className="tap-target" onClick={() => remove(r.id)}
                    aria-label={armed ? `confirm delete personal best ${r.id}` : `delete personal best ${r.id}`}
                    style={{ background: 'none', border: 'none', color: armed ? colors.danger : colors.muted,
                      cursor: 'pointer', fontSize: armed ? type.size.base : '1rem', fontWeight: armed ? type.weight.bold : type.weight.regular }}>
                    {armed ? '✓?' : '×'}
                  </button>
                </div>
              )
            })}
          </div>
        ))
      )}
    </div>
  )
}
